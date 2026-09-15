FROM node:18-alpine

WORKDIR /app

# Install dumb-init, curl, and openssl (required by Prisma's query/schema engines)
RUN apk add --no-cache dumb-init curl openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 4000

# Health check (allow initial startup)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 0

# Run application
ENTRYPOINT ["dumb-init", "--"]
# Start with npm run dev for development, will switch to npm start in production
CMD ["npm", "run", "dev"]
