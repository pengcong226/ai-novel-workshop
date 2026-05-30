# ============================================================
# Production Multi-Stage Dockerfile
# Stage 1: Node 20 builds the Vue/Vite frontend
# Stage 2: Nginx serves the compiled static assets
# ============================================================

# --- Stage 1: Build frontend ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install dependencies with frozen lockfile
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .

# Disable Tauri detection during build and PWA service worker registration
# that can break in container context
ENV TAURI_ENV_PLATFORM=
RUN npm run build

# --- Stage 2: Serve with Nginx ---
FROM nginx:1.27-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check: verify Nginx responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
