# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /build

# Copy go mod files first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/server

# Runtime stage
FROM alpine:3.19

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy binary
COPY --from=builder /build/server .
COPY --from=builder /build/migrations ./migrations
COPY --from=builder /build/assets ./assets

# Expose port
EXPOSE 4001

# Run
ENTRYPOINT ["./server"]
