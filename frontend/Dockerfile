# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Build args for env at build time (Next.js bakes NEXT_PUBLIC_* at build)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

# Build
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3010

ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
