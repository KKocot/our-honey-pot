# Build stage
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy package files, lockfile and pnpm config
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies (postinstall copies hb-auth assets to public/)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (Astro SSR with @astrojs/node standalone)
RUN pnpm run build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 astro

# Copy built application and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/scripts/start.mjs ./scripts/start.mjs

# Set ownership
RUN chown -R astro:nodejs /app

USER astro

# Expose port (our-honey-pot defaults to 4327)
EXPOSE 4327

ENV HOST=0.0.0.0
ENV PORT=4327
ENV NODE_ENV=production

# Start the server (validates the runtime env before listening)
CMD ["node", "./scripts/start.mjs"]
