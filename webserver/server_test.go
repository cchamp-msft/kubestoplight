package webserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestSPAHandler(t *testing.T) {
	static := fstest.MapFS{
		"index.html":             {Data: []byte("<html>app</html>")},
		"assets/app.js":          {Data: []byte("js")},
		"village-art/hall-a.png": {Data: []byte("png")},
	}
	h := spaHandler(static)

	cases := []struct {
		path     string
		status   int
		body     string // substring; "" to skip
		location string
	}{
		{"/", http.StatusOK, "app", ""},
		{"/village", http.StatusOK, "app", ""},
		{"/village?bg=glacier", http.StatusOK, "app", ""},
		{"/assets/app.js", http.StatusOK, "js", ""},
		{"/village-art/hall-a.png", http.StatusOK, "png", ""},
		// A directory is not a page: no listing, the app loads instead.
		{"/village-art", http.StatusOK, "app", ""},
		{"/nope/deeper", http.StatusOK, "app", ""},
		// Trailing slashes would break the bundle's relative asset URLs.
		{"/village/", http.StatusMovedPermanently, "", "/village"},
		{"/village/?bg=glacier", http.StatusMovedPermanently, "", "/village?bg=glacier"},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, c.path, nil))
		if rec.Code != c.status {
			t.Errorf("%s: status %d, want %d", c.path, rec.Code, c.status)
		}
		if c.body != "" && !strings.Contains(rec.Body.String(), c.body) {
			t.Errorf("%s: body %q, want it to contain %q", c.path, rec.Body.String(), c.body)
		}
		if got := rec.Header().Get("Location"); got != c.location {
			t.Errorf("%s: Location %q, want %q", c.path, got, c.location)
		}
	}
}
