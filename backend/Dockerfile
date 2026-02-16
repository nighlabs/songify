# Build stage
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=1 GOOS=linux go build -o server ./cmd/server

# Runtime stage
FROM alpine:3.23

WORKDIR /app

# Build args for customizable UID/GID (useful for bind mount permissions)
ARG UID=10001
ARG GID=10001

# Install runtime dependencies and create non-root user with known UID/GID
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g ${GID} -S appgroup \
    && adduser -u ${UID} -G appgroup -D -S appuser

# Copy binary from builder
COPY --from=builder /app/server .

# Create data directory for SQLite
RUN mkdir -p /data && chown appuser:appgroup /data

# Switch to non-root user
USER appuser

# Default environment variables
ENV PORT=8080
ENV DATABASE_PATH=/data/songify.db

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["./server"]
