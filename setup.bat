@echo off
REM Setup script for Windows

echo.
echo 🚀 School ERP - Setup Script
echo ====================================

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed. Please install Docker first.
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

REM Create .env from .env.example if it doesn't exist
if not exist .env (
    echo 📋 Creating .env from .env.example...
    copy .env.example .env
    echo ✅ .env created (please review and update if needed)
)

REM Create directories
echo 📁 Creating directories...
if not exist backend\src mkdir backend\src
if not exist frontend\src mkdir frontend\src
if not exist docs mkdir docs

REM Install dependencies
echo 📦 Installing Node.js dependencies...
call npm install

REM Create backend package.json if it doesn't exist
if not exist backend\package.json (
    echo 🏗️  Initializing backend...
    cd backend
    call npm init -y
    call npm install --save @nestjs/common @nestjs/core @nestjs/config @nestjs/typeorm @nestjs/jwt @nestjs/passport typeorm pg prisma @prisma/client bcrypt passport passport-jwt passport-ldap ldapjs class-validator class-transformer dotenv zod cors helmet
    call npm install --save-dev @nestjs/cli typescript @types/node @types/bcrypt @types/passport-ldap @nestjs/testing @nestjs/schematics
    cd ..
)

REM Create frontend package.json if it doesn't exist
if not exist frontend\package.json (
    echo 🎨 Initializing frontend...
    cd frontend
    call npm init -y
    call npm install next react react-dom axios zustand next-auth tailwindcss postcss autoprefixer
    call npm install --save-dev typescript @types/react @types/node
    cd ..
)

REM Build Docker images
echo 🐳 Building Docker images...
call docker-compose build

REM Create database
echo 🗄️  Creating database...
call docker-compose up -d postgres
timeout /t 10 /nobreak

REM Start all services
echo 🚀 Starting all services...
call docker-compose up -d

REM Wait for services to be healthy
echo ⏳ Waiting for services to be ready...
timeout /t 15 /nobreak

REM Check health
echo.
echo ✅ Setup Complete!
echo.
echo 📍 Access URLs:
echo   Frontend:    http://localhost:3000
echo   Backend API: http://localhost:4000/api
echo   Swagger:     http://localhost:4000/api/docs
echo   MailHog:     http://localhost:8025
echo.
echo 🛠️  Useful Commands:
echo   View logs:     docker-compose logs -f
echo   Stop services: docker-compose down
echo   Reset all:     docker-compose down -v
echo   Prisma Studio: docker-compose exec backend npx prisma studio
echo.
pause
