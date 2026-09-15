# School ERP - MVP Phase 1

Système de gestion complet pour établissements scolaires en Côte d'Ivoire.

## 🚀 Stack Technique

- **Backend**: NestJS 10+, TypeScript, Prisma ORM
- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Auth**: LDAP (OpenLDAP osixia), JWT
- **Email**: MailHog (dev)
- **Containerisation**: Docker Compose

## 📁 Structure

```
backend/                    # NestJS application
  src/
    auth/                   # Authentication (LDAP + JWT)
    users/                  # Users management + RBAC
    schools/                # School configuration
    students/               # Student management
    parents/                # Parent/Guardian management
    staff/                  # Teachers & Staff
    admissions/             # Admission workflow
    classes/                # Class & enrollment management
    common/
    config/
    database/
  prisma/
    schema.prisma           # Database schema
    seed.ts                 # Test data
  package.json
  .env.example

frontend/                   # Next.js application
  src/
    app/                    # App router
    components/
    lib/
    types/
  public/
  package.json

docker-compose.yml          # Services orchestration
setup.sh                    # Linux/macOS setup
setup.bat                   # Windows setup
README.md
```

## ⚡ Quick Start

```bash
# Clone & setup
git clone <repo>
cd <project>

# Linux/macOS
./setup.sh

# Windows
setup.bat

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

## 🔗 Access URLs

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api
- Swagger: http://localhost:4000/api/docs
- MailHog: http://localhost:8025
- Prisma Studio: `docker-compose exec backend npx prisma studio`

## 📚 Documentation

See `/docs` folder for detailed documentation.

## 🔐 Test Accounts (Phase 1)

| Role | Email | Password |
|------|-------|----------|
| SUPER_ADMIN | admin@school.local | admin123 |
| DIRECTOR | director@school.local | dir123 |
| SECRETARY | secretary@school.local | sec123 |
| TEACHER | teacher@school.local | teach123 |
| STUDENT | student@school.local | stud123 |
| PARENT | parent@school.local | parent123 |

