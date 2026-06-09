# ─── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml* web/pnpm.yaml* web/.npmrc* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY web/ ./
RUN pnpm run build


# ─── Stage 2: Build Go binary ────────────────────────────────────────────────
FROM golang:1.25-alpine AS go-builder

# SQLite (modernc.org/sqlite) is pure Go — no CGO needed.
ENV CGO_ENABLED=0 GOOS=linux

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=frontend-builder /app/web/dist ./web/dist

RUN go build \
      -buildvcs=false \
      -ldflags="-s -w -X main.Version=${APP_VERSION:-v1.0.0}" \
      -o bin/mailtub \
      ./cmd/mailtub


# ─── Stage 3: Minimal runtime image ─────────────────────────────────────────
FROM gcr.io/distroless/static:nonroot

WORKDIR /app
COPY --from=go-builder /app/bin/mailtub /app/mailtub

# Persistent data directory
VOLUME ["/data"]

# HTTP
EXPOSE 8080
# SMTP
EXPOSE 2525

LABEL org.opencontainers.image.title="MailTub"
LABEL org.opencontainers.image.description="Self-hosted disposable email service"
LABEL org.opencontainers.image.url="https://github.com/dml-labs/mailtub"
LABEL org.opencontainers.image.source="https://github.com/dml-labs/mailtub"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.vendor="DML Labs"

ENV PORT=8080 \
    SMTP_PORT=2525 \
    DATABASE_PATH=/data/mailtub.db \
    MAILTUB_DOMAIN=localhost \
    LOG_LEVEL=info \
    APP_VERSION=v1.0.0

ENTRYPOINT ["/app/mailtub"]
