FROM node:18-alpine

WORKDIR /app

# Install dumb-init, curl, and openssl (required by Prisma's query/schema engines)
RUN apk add --no-cache dumb-init curl openssl

# Copy package files and the Prisma schema (needed to generate the client)
COPY package*.json ./
COPY prisma ./prisma

# Install dependencies and generate the Prisma client
RUN npm install && npx prisma generate

# Copy source code
COPY . .
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Expose port
EXPOSE 4000

# Health check (Nest in watch mode needs time for its first compilation)
HEALTHCHECK --interval=15s --timeout=5s --start-period=300s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

# Run application (development: schema sync + seed on empty DB + watch mode)
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
