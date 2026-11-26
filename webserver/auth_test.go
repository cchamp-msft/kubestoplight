package webserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func authedServer(key string) (*Server, http.Handler) {
	s := &Server{}
	s.SetAuth(key, time.Hour)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/info", s.handleInfo)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/session", s.handleSession)
	mux.HandleFunc("/ws/pods", s.handleSession) // stands in for the socket: only the guard is under test
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("app")) })
	return s, s.requireAuth(mux)
}

func do(h http.Handler, method, path, body string, headers ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func login(t *testing.T, h http.Handler, key string) loginJSON {
	t.Helper()
	rec := do(h, http.MethodPost, "/api/login", `{"key":"`+key+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("login: status %d, body %s", rec.Code, rec.Body)
	}
	var out loginJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestAuthGuard(t *testing.T) {
	_, h := authedServer("s3cret")

	// Open without a token: the app shell and what the lock screen needs.
	for _, p := range []string{"/", "/village", "/api/info"} {
		if rec := do(h, http.MethodGet, p, ""); rec.Code != http.StatusOK {
			t.Errorf("%s without token: status %d, want 200", p, rec.Code)
		}
	}
	// Closed without one.
	for _, p := range []string{"/api/session", "/api/clusters", "/api/pods/a/b/c", "/ws/pods"} {
		if rec := do(h, http.MethodGet, p, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s without token: status %d, want 401", p, rec.Code)
		}
	}

	if rec := do(h, http.MethodPost, "/api/login", `{"key":"nope"}`); rec.Code != http.StatusUnauthorized {
		t.Errorf("wrong key: status %d, want 401", rec.Code)
	}

	got := login(t, h, "s3cret")
	if until := time.Until(time.UnixMilli(got.ExpiresAt)); until < 59*time.Minute || until > time.Hour {
		t.Errorf("expiresAt is %s away, want about 1h", until)
	}
	if rec := do(h, http.MethodGet, "/api/session", "", "Authorization", "Bearer "+got.Token); rec.Code != http.StatusNoContent {
		t.Errorf("bearer token: status %d, want 204", rec.Code)
	}
	if rec := do(h, http.MethodGet, "/ws/pods", "", "Sec-WebSocket-Protocol", wsAuthProtocol+", "+got.Token); rec.Code != http.StatusNoContent {
		t.Errorf("subprotocol token: status %d, want 204", rec.Code)
	}
	if rec := do(h, http.MethodGet, "/api/session", "", "Authorization", "Bearer "+got.Token+"x"); rec.Code != http.StatusUnauthorized {
		t.Errorf("tampered token: status %d, want 401", rec.Code)
	}
}

func TestAuthTokenLifetime(t *testing.T) {
	a := newAuthenticator("s3cret", time.Hour)
	now := time.Now()
	a.now = func() time.Time { return now }
	token, _ := a.issue()

	if !a.valid(token) {
		t.Fatal("fresh token rejected")
	}
	// Moving the expiry forward breaks the signature.
	_, sig, _ := strings.Cut(token, ".")
	if a.valid("99999999999." + sig) {
		t.Error("token with a forged expiry accepted")
	}
	// A token outlives a restart with the same key, and dies with the key.
	if !newAuthenticator("s3cret", time.Hour).valid(token) {
		t.Error("token rejected after restart with the same key")
	}
	if newAuthenticator("changed", time.Hour).valid(token) {
		t.Error("token accepted after the key changed")
	}
	now = now.Add(time.Hour + time.Second)
	if a.valid(token) {
		t.Error("expired token accepted")
	}
}

func TestLoginThrottle(t *testing.T) {
	s, h := authedServer("s3cret")
	now := time.Now()
	s.auth.now = func() time.Time { return now }

	for i := 0; i < loginMaxFailures; i++ {
		do(h, http.MethodPost, "/api/login", `{"key":"guess"}`)
	}
	if rec := do(h, http.MethodPost, "/api/login", `{"key":"s3cret"}`); rec.Code != http.StatusTooManyRequests {
		t.Errorf("after %d failures: status %d, want 429", loginMaxFailures, rec.Code)
	}
	now = now.Add(loginWindow + time.Second)
	login(t, h, "s3cret")
}

func TestNoAuthIsOpen(t *testing.T) {
	_, h := authedServer("")
	if rec := do(h, http.MethodGet, "/api/session", ""); rec.Code != http.StatusNoContent {
		t.Errorf("no key set: status %d, want 204", rec.Code)
	}
	rec := do(h, http.MethodGet, "/api/info", "")
	if !strings.Contains(rec.Body.String(), `"authRequired":false`) {
		t.Errorf("info: %s", rec.Body)
	}
}
