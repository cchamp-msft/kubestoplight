package main

import "embed"

// webDist holds the compiled React SPA from web/dist.
// The web/dist directory must be built with `npm run build` inside web/
// before running `go build`.
//
//go:embed all:web/dist
var webDist embed.FS
