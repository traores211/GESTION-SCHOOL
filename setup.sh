#!/bin/bash
# Setup script for Linux/macOS

set -e

echo "🚀 School ERP - Setup Script"
echo "===================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env from .env.example if it doesn't exist
if [ ! -f .env ]; then
    echo "📋 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env created (please review and update if needed)"
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p backend/src
mkdir -p frontend/src
mkdir -p docs

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Create backend package.json if it doesn't exist
if [ ! -f backend/package.json ]; then
    echo "🏗️  Initializing backend..."
    cd backend
    npm init -y
    npm install --save @nestjs/common @nestjs/core @nestjs/config @nestjs/typeorm @nestjs/jwt @nestjs/passport typeorm pg prisma @prisma/client bcrypt passport passport-jwt passport-ldap ldapjs class-validator class-transformer dotenv zod cors helmet
    npm install --save-dev @nestjs/cli typescript @types/node @types/bcrypt @types/passport-ldap @nestjs/testing @nestjs/schematics
    cd ..
fi

# Create frontend package.json if it doesn't exist
if [ ! -f frontend/package.json ]; then
    echo "🎨 Initializing frontend..."
    cd frontend
    npm init -y
    npm install next react react-dom axios zustand next-auth tailwindcss postcss autoprefixer
    npm install --save-dev typescript @types/react @types/node
    cd ..
fi

# Build Docker images
echo "🐳 Building Docker images..."
docker-compose build

# Create database
echo "🗄️  Creating database..."
docker-compose up -d postgres
sleep 10

# Run migrations (when ready)
# docker-compose exec backend npx prisma migrate dev

# Start all services
echo "🚀 Starting all services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 15

# Check health
echo "✅ Setup Complete!"
echo ""
echo "📍 Access URLs:"
echo "  Frontend:    http://localhost:3000"
echo "  Backend API: http://localhost:4000/api"
echo "  Swagger:     http://localhost:4000/api/docs"
echo "  MailHog:     http://localhost:8025"
echo ""
echo "🛠️  Useful Commands:"
echo "  View logs:     docker-compose logs -f"
echo "  Stop services: docker-compose down"
echo "  Reset all:     docker-compose down -v"
echo "  Prisma Studio: docker-compose exec backend npx prisma studio"
echo ""
