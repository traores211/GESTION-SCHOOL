FROM node:18-alpine

WORKDIR /app

# Install dumb-init and curl for health check
RUN apk add --no-cache dumb-init curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Health check (next dev compiles the first page on demand)
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# Run application in development mode. node_modules is a named volume that outlives image
# rebuilds, so resync it with package.json before starting.
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npm install --no-audit --no-fund --loglevel=error && npm run dev"]
