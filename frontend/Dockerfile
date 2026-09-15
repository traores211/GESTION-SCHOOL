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

# Health check (allow initial startup)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 0

# Run application in development mode
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]
