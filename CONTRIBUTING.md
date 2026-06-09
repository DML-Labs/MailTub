# Contributing to MailTub

Thank you for your interest in contributing to MailTub! This guide will help you get started.

## Project Overview

MailTub is a self-hosted disposable email service built with:
- **Go 1.25** — single binary backend (HTTP + SMTP + SQLite + WebSocket)
- **React 18 + TypeScript + Tailwind v3** — frontend (embedded in the binary)
- **modernc.org/sqlite** — pure-Go SQLite driver (no CGO)

## Development Setup

### Prerequisites

- Go 1.25+
- Node.js 22+ with pnpm 9+

### Getting Started

```bash
git clone https://github.com/dml-labs/mailtub.git
cd mailtub

# Install frontend dependencies
cd web && pnpm install --ignore-workspace && cd ..
```

**Option A — run everything together (recommended for first-time setup):**

```bash
# Terminal 1: build frontend, then start Go backend
cd web && pnpm run build && cd ..
go build -buildvcs=false -o bin/mailtub ./cmd/mailtub
./bin/mailtub
# UI available at http://localhost:8080
```

**Option B — hot-reload frontend development:**

```bash
# Terminal 1: Go backend
go build -buildvcs=false -o bin/mailtub ./cmd/mailtub && ./bin/mailtub

# Terminal 2: Vite dev server (proxies /api and /ws to Go on :3000)
cd web && GO_PORT=3000 PORT=3001 pnpm exec vite
# UI available at http://localhost:3001
```

### Quick Test

```bash
# Send a test email
./bin/mailtub new -q | xargs -I{} ./bin/mailtub send {}
```

## Project Structure

```
cmd/mailtub/         CLI subcommand dispatcher
internal/
  api/               HTTP router + REST handlers
  api/admin/         Admin panel (HMAC auth + REST)
  smtp/              SMTP server (STARTTLS support)
  storage/           SQLite storage layer
  ws/                WebSocket hub
  config/            Environment-based configuration
  domain/            Core business models
  ratelimit/         Per-IP rate limiter
web/src/             React frontend source
  api/               Typed API clients
  components/        Shared UI components
  pages/             InboxPage, AdminLogin, AdminDashboard
  hooks/             useMailboxTabs, useWebSocket, etc.
  contexts/          ThemeContext
scripts/             Release helper scripts (e.g. gen-winres.sh — patches Windows version metadata before GoReleaser builds)
```

## Making Changes

### Backend (Go)

```bash
# Run tests
go test ./...

# Build binary (after changing .go files)
go build -buildvcs=false -o bin/mailtub ./cmd/mailtub

# Build with embedded frontend
cd web && pnpm run build && cd ..
go build -buildvcs=false -o bin/mailtub ./cmd/mailtub
```

### Frontend (React)

```bash
cd web
pnpm run build          # Production build (embedded in binary)
pnpm exec vite          # Dev server with hot-reload (set GO_PORT to match backend)
```

## Pull Request Guidelines

1. **Fork and branch** — create a feature branch from `main`
2. **Small, focused PRs** — one feature or fix per PR
3. **Tests** — add Go tests for new backend functionality
4. **No breaking changes** — maintain backward compatibility in the REST API
5. **Conventional commits** — use `feat:`, `fix:`, `docs:`, `refactor:` prefixes

## Code Style

- **Go**: follow `gofmt` and `golint`; exported symbols must have doc comments
- **TypeScript**: strict mode, no `any`, use named exports
- **CSS**: Tailwind utilities; add custom tokens to `index.css` CSS variables

## Reporting Issues

- **Bugs** → open a GitHub Issue with reproduction steps
- **Security** → email devmayank-inbox@gmail.com (see [SECURITY.md](SECURITY.md))
- **Features** → open a GitHub Discussion first to align on direction

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).

---

*Developed by [DML Labs](https://github.com/dml-labs) — Founder & Lead Engineer: [@Devmayank-official](https://github.com/Devmayank-official)*
