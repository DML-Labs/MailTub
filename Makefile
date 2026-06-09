# ─── MailTub Makefile ────────────────────────────────────────────────────────
# Targets:
#   make deps     – download & tidy Go modules
#   make frontend – build React → web/dist
#   make build    – deps + frontend + compile Go binary
#   make run      – build + start binary
#   make dev      – run frontend dev server + go run (needs two terminals)
#   make clean    – remove build artefacts
#   make test     – run Go tests
#   make docker   – build Docker image
# ─────────────────────────────────────────────────────────────────────────────

BINARY   := bin/mailtub
CMD_PKG  := ./cmd/mailtub
WEB_DIR  := ./web
GO_FILES := $(shell find . -name '*.go' -not -path './vendor/*')
LDFLAGS  := -s -w -X main.version=$(shell git describe --tags --always 2>/dev/null || echo dev)

.PHONY: deps frontend build run dev clean test docker lint

## deps: Download and tidy Go modules.
deps:
        go mod tidy

## frontend: Install npm deps and build the React app into web/dist.
frontend:
        cd $(WEB_DIR) && pnpm install --frozen-lockfile 2>/dev/null || pnpm install
        cd $(WEB_DIR) && pnpm run build

## build: Full build — modules, frontend, Go binary.
build: deps frontend
        @mkdir -p bin
        go build -buildvcs=false -ldflags="$(LDFLAGS)" -o $(BINARY) $(CMD_PKG)
        @echo "Built: $(BINARY)"

## run: Build and run the binary.
run: build
        PORT=$${PORT:-8080} ./$(BINARY)

## dev-frontend: Run only the Vite dev server.
dev-frontend:
        cd $(WEB_DIR) && pnpm run dev

## dev-go: Run Go with live reloading (requires Air: go install github.com/air-verse/air@latest).
dev-go:
        air -c .air.toml 2>/dev/null || PORT=$${PORT:-8080} MAILTUB_DOMAIN=localhost go run $(CMD_PKG)

## dev: Start both frontend and backend for development.
dev:
        @echo "Start two terminals:"
        @echo "  Terminal 1: make dev-frontend"
        @echo "  Terminal 2: make dev-go"

## clean: Remove compiled artefacts.
clean:
        rm -rf bin/ $(WEB_DIR)/dist $(WEB_DIR)/node_modules data/

## test: Run Go tests.
test:
        go test -v -race ./...

## docker: Build the Docker image.
docker:
        docker build -t mailtub:latest .

## lint: Run Go linter (requires golangci-lint).
lint:
        golangci-lint run ./...

## release: Run GoReleaser in snapshot mode (local test).
release-dry:
        goreleaser build --snapshot --clean

## release: Publish a new release with GoReleaser (requires GITHUB_TOKEN).
release:
        goreleaser release --clean

## help: List all targets.
help:
        @grep -E '^## ' Makefile | sed 's/## //' | column -t -s ':'
