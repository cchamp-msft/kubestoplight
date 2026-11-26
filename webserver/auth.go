package webserver

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// wsAuthProtocol is the WebSocket subprotocol a browser offers alongside its
// session token (browsers can't set an Authorization header on a WebSocket).
// The client sends ["ksl.auth", "<token>"]; the server selects "ksl.auth".
const wsAuthProtocol = "ksl.auth"

const (
	loginMaxFailures = 10
	loginWindow      = time.Minute
)

// loginJSON is the response of POST /api/login.
type loginJSON struct {
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expiresAt"` // Unix milliseconds
}

// authenticator guards the API with one shared access key. A correct key is
// exchanged for a signed session token that expires after ttl. Tokens are
// stateless (expiry + HMAC keyed from the access key), so they survive a
// restart and all die when the key changes.
type authenticator struct {
	keyHash [sha256.Size]byte
	signKey []byte
	ttl     time.Duration
	now     func() time.Time

	mu       sync.Mutex
	failures []time.Time // recent failed logins, oldest first
}

func newAuthenticator(key string, ttl time.Duration) *authenticator {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("kubestoplight session token v1"))
	return &authenticator{
		keyHash: sha256.Sum256([]byte(key)),
		signKey: mac.Sum(nil),
		ttl:     ttl,
		now:     time.Now,
	}
}

func (a *authenticator) checkKey(key string) bool {
	h := sha256.Sum256([]byte(key))
	return subtle.ConstantTimeCompare(h[:], a.keyHash[:]) == 1
}

func (a *authenticator) sign(exp string) string {
	mac := hmac.New(sha256.New, a.signKey)
	mac.Write([]byte(exp))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// issue returns a new token and when it expires.
func (a *authenticator) issue() (string, time.Time) {
	expires := a.now().Add(a.ttl)
	exp := strconv.FormatInt(expires.Unix(), 10)
	return exp + "." + a.sign(exp), expires
}

func (a *authenticator) valid(token string) bool {
	exp, sig, ok := strings.Cut(token, ".")
	if !ok {
		return false
	}
	if !hmac.Equal([]byte(sig), []byte(a.sign(exp))) {
		return false
	}
	unix, err := strconv.ParseInt(exp, 10, 64)
	return err == nil && a.now().Unix() < unix
}

// throttled reports whether too many logins failed recently. The limit is
// global, not per client: behind a proxy or tunnel every client shares an IP.
func (a *authenticator) throttled() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	cutoff := a.now().Add(-loginWindow)
	i := 0
	for i < len(a.failures) && a.failures[i].Before(cutoff) {
		i++
	}
	a.failures = a.failures[i:]
	return len(a.failures) >= loginMaxFailures
}

func (a *authenticator) recordFailure() {
	a.mu.Lock()
	a.failures = append(a.failures, a.now())
	a.mu.Unlock()
}

// SetAuth requires an access key for the API and the WebSocket. A browser
// trades the key for a session token (POST /api/login) that lasts ttl. An
// empty key leaves the server open.
func (s *Server) SetAuth(key string, ttl time.Duration) {
	if key == "" {
		s.auth = nil
		return
	}
	s.auth = newAuthenticator(key, ttl)
}

// requestToken finds the session token: a Bearer header, or the entry after
// "ksl.auth" in the WebSocket subprotocol list.
func requestToken(r *http.Request) string {
	if t, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return t
	}
	for _, h := range r.Header.Values("Sec-WebSocket-Protocol") {
		for _, p := range strings.Split(h, ",") {
			if p = strings.TrimSpace(p); p != "" && p != wsAuthProtocol {
				return p
			}
		}
	}
	return ""
}

// requireAuth rejects API and WebSocket requests without a valid token.
// /api/info and /api/login stay open so the UI can show its lock screen, and
// so do the static files: the bundle holds no cluster data.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		guarded := (strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/ws/")) &&
			p != "/api/info" && p != "/api/login"
		if s.auth != nil && guarded && !s.auth.valid(requestToken(r)) {
			writeError(w, http.StatusUnauthorized, "access key required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// handleLogin trades the access key for a session token.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.auth == nil {
		writeError(w, http.StatusNotFound, "this server has no access key")
		return
	}
	if s.auth.throttled() {
		w.Header().Set("Retry-After", strconv.Itoa(int(loginWindow.Seconds())))
		writeError(w, http.StatusTooManyRequests, "too many failed attempts; try again in a minute")
		return
	}
	var body struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !s.auth.checkKey(body.Key) {
		s.auth.recordFailure()
		writeError(w, http.StatusUnauthorized, "wrong access key")
		return
	}
	token, expires := s.auth.issue()
	writeJSON(w, http.StatusOK, loginJSON{Token: token, ExpiresAt: expires.UnixMilli()})
}

// handleSession answers 204 to a valid token (requireAuth has checked it), so
// a client can ask whether its stored token still works.
func (s *Server) handleSession(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
