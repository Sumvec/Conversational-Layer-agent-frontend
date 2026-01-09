# ---------- Builder stage ----------
  FROM node:18-alpine AS builder
  WORKDIR /app
  
  # Copy package files first (for optimal layer caching)
  COPY package*.json ./
  
  # Install all deps (dev + prod) required for the build
  RUN npm ci
  
  # Copy full source for the build step
  COPY . .
  
  # Run the build (your package.json build runs generate-style-config + webpack)
  RUN npm run build
  
  # Ensure build output is available in /app/public (webpack commonly outputs to /dist)
  RUN mkdir -p /app/public \
    && if [ -d /app/dist ]; then cp -a /app/dist/. /app/public/; \
       elif [ -d /app/build ]; then cp -a /app/build/. /app/public/; \
       elif [ -d /app/public ]; then cp -a /app/public/. /app/public/; \
       else echo "Build produced no dist/build/public directory"; fi
  
  # ---------- Runtime stage ----------
  FROM node:18-alpine AS runtime
  WORKDIR /app
  
  # Install only production deps
  COPY package*.json ./
  RUN npm ci --only=production
  
  # Copy server code
  COPY server/ ./server/
  
  # Copy the built static assets from the builder
  COPY --from=builder /app/public /app/public
  
  # Create non-root user and set ownership
  RUN addgroup -g 1001 -S nodejs \
   && adduser -S nodejs -u 1001 \
   && chown -R nodejs:nodejs /app
  USER nodejs
  
  # Expose app port
  EXPOSE 7007,7008,7009
  
  # Healthcheck endpoint (adjust if your server uses a different path)
  HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"
  
  # Start the app (production start)
  CMD ["node", "server/index.js"]
  