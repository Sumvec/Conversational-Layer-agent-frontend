FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install all deps (including dev)
COPY package*.json ./
RUN npm ci

# Copy source and run build to produce frontend assets (webpack)
COPY . .
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Copy only production deps and install
COPY package*.json ./
RUN npm ci --only=production

# Copy server and built frontend from builder stage
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public

# Create non-root user and give ownership
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server/index.js"]