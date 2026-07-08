.PHONY: web-build build run-web run-tui clean

BINARY := kubestoplight
WEB_DIR := web

# On Windows, GNU make may not inherit the full system PATH.
# Prepend the Go bin directory so `go` is always found.
export PATH := C:/Program Files/Go/bin;$(PATH)

## web-build: build the React SPA into web/dist (required before go build)
web-build:
	cd $(WEB_DIR) && npm install && npm run build

## build: build the React SPA then compile the Go binary with embedded assets
build: web-build
	go build -o $(BINARY) .

## run-web: build everything and start the web server on 127.0.0.1:8080
run-web: build
	./$(BINARY) --web

## run-tui: build everything and start the TUI (terminal mode)
run-tui: build
	./$(BINARY)

## clean: remove the compiled binary and the built frontend assets
clean:
	rm -f $(BINARY)
	rm -rf $(WEB_DIR)/dist
