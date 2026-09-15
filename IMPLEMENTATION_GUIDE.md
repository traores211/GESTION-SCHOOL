# Implementation Guide - School ERP Phase 1

## Quick Start (5 minutes)

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Git

### Setup (Windows)

```powershell
# Clone repository
git clone <repo> school-erp
cd school-erp

# Run setup script
.\setup.bat

# Wait for services to start (~30 seconds)

# Open browser
# Frontend: http://localhost:3000
# Backend: http://localhost:4000/api/docs
```

### Setup (Linux/macOS)

```bash
# Clone repository
git clone <repo> school-erp
cd school-erp

# Make setup executable and run
chmod +x setup.sh
./setup.sh

# Wait for services to start (~30 seconds)

# Open browser
# Frontend: http://localhost:3000
# Backend: http://localhost:4000/api/docs
```

---

## Development Workflow

### 1. Start Services

```bash
# Start all services in background
docker-compose up -d

# View logs in real-time
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 2. Backend Development

```bash
# Terminal 1: Start backend dev server
cd backend
npm run dev

# The backend runs on http://localhost:4000
# API docs on http://localhost:4000/api/docs
```

### 3. Frontend Development

```bash
# Terminal 2: Start frontend dev server
cd frontend
npm run dev

# The frontend runs on http://localhost:3000
```

### 4. Database Management

```bash
# View database in GUI
docker-compose exec backend npx prisma studio

# This opens http://localhost:5555

# Create a new migration
docker-compose exec backend npx prisma migrate dev --name "description"

# View current schema
docker-compose exec backend npx prisma validate

# Seed database with test data
docker-compose exec backend npm run seed
```

### 5. Testing

```bash
# Backend tests
cd backend
npm run test

# Frontend tests
cd frontend
npm run test
```

---

## Backend Implementation Order

### Step 1: Setup NestJS Project (1-2 days)

```bash
cd backend

# Already initialized via setup.sh, but if starting fresh:
npm init -y
npm install -D @nestjs/cli
npx @nestjs/cli new . --skip-git

# Install core dependencies
npm install \
  @nestjs/common @nestjs/core @nestjs/config \
  @nestjs/jwt @nestjs/passport @nestjs/typeorm \
  typeorm pg \
  @prisma/client prisma \
  bcrypt class-validator class-transformer \
  dotenv passport passport-jwt \
  cors helmet zod
```

**Main files to create:**

```
src/
  main.ts                        # Entry point
  app.module.ts                  # Root module
  config/
    config.ts                    # Configuration
    database.ts                  # DB config
```

**main.ts**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  });

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('School ERP API')
    .setDescription('Complete school management system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const PORT = process.env.PORT || 4000;
  await app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
  });
}

bootstrap();
```

**app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SchoolsModule } from './schools/schools.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    SchoolsModule,
    StudentsModule,
  ],
})
export class AppModule {}
```

### Step 2: Prisma & Database (1 day)

```bash
# Initialize Prisma
npx prisma init

# Update .env with your DATABASE_URL

# Copy schema.prisma (already created in root)
cp ../schema.prisma ./prisma/

# Create initial migration
npx prisma migrate dev --name "init"

# Generate Prisma client
npx prisma generate
```

**prisma/database.service.ts**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    console.log('✅ Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### Step 3: Authentication (2-3 days)

This is **critical** - all other modules depend on auth.

**src/auth/auth.service.ts**

- JWT generation & validation
- LDAP authentication
- Password hashing
- Token refresh logic
- User lockout protection

**src/auth/guards/jwt.guard.ts**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {}
```

**src/auth/strategies/jwt.strategy.ts**

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email };
  }
}
```

### Step 4: Users & RBAC (2 days)

**src/users/users.service.ts**

CRUD operations for users with RBAC checks.

**src/common/decorators/roles.decorator.ts**

```typescript
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
```

**src/common/guards/roles.guard.ts**

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
```

### Step 5: Schools Module (1 day)

**src/schools/schools.service.ts**

```typescript
@Injectable()
export class SchoolsService {
  constructor(private prisma: PrismaService) {}

  async create(organisationId: string, dto: CreateSchoolDto) {
    return this.prisma.school.create({
      data: { ...dto, organisationId },
    });
  }

  async findAll(organisationId: string) {
    return this.prisma.school.findMany({
      where: { organisationId },
    });
  }

  async findOne(id: string) {
    return this.prisma.school.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateSchoolDto) {
    return this.prisma.school.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    return this.prisma.school.delete({ where: { id } });
  }
}
```

### Step 6: Students Module (2 days)

**src/students/students.service.ts**

```typescript
@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  // CRUD + 360° view
  async getStudentProfile(id: string) {
    return this.prisma.student.findUnique({
      where: { id },
      include: {
        user: true,
        parents: true,
        enrollments: {
          include: { class: true },
        },
        attendance: true,
      },
    });
  }
}
```

### Step 7: Admissions Workflow (2 days)

**src/admissions/admissions.service.ts**

State machine implementation:

```typescript
async updateStatus(id: string, newStatus: AdmissionStatus) {
  const admission = await this.prisma.admission.findUnique({
    where: { id },
  });

  // Validate state transitions
  const validTransitions = {
    CANDIDATURE: ['DOSSIER_INCOMPLET', 'DOSSIER_COMPLET'],
    DOSSIER_COMPLET: ['ETUDE', 'DOSSIER_INCOMPLET'],
    ETUDE: ['TEST', 'ENTRETIEN', 'REJETÉ'],
    ADMIS: ['INSCRIPTION'],
    INSCRIPTION: ['CONFIRMÉ'],
  };

  if (!validTransitions[admission.status]?.includes(newStatus)) {
    throw new BadRequestException('Invalid status transition');
  }

  return this.prisma.admission.update({
    where: { id },
    data: { status: newStatus },
  });
}
```

### Step 8: Classes & Enrollment (1 day)

**src/classes/classes.service.ts**

- Class CRUD
- Enrollment management
- Capacity checking

### Step 9: Attendance Tracking (1 day)

**src/attendance/attendance.service.ts**

- Mark attendance
- Bulk operations
- Statistics

### Step 10: Audit Logging (1 day)

**src/database/audit.service.ts**

```typescript
@Injectable()
export class AuditService {
  constructor(
    private prisma: PrismaService,
    private request: Request,
  ) {}

  async log(action: string, resource: string, resourceId: string, oldValues?: any, newValues?: any) {
    return this.prisma.auditLog.create({
      data: {
        action,
        resource,
        resourceId,
        oldValues: JSON.stringify(oldValues),
        newValues: JSON.stringify(newValues),
        ipAddress: this.request.ip,
        userAgent: this.request.get('user-agent'),
        userId: this.request['user']?.id,
      },
    });
  }
}
```

---

## Frontend Implementation Order

### Step 1: Next.js Setup (1 day)

```bash
cd frontend

# Already initialized, but if starting fresh:
npm init -y
npx create-next-app@latest . --typescript --tailwind

# Install additional dependencies
npm install \
  axios zustand next-auth \
  react-hook-form zod
```

**app/layout.tsx**

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'School ERP',
  description: 'School management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
```

### Step 2: Authentication Pages (2 days)

**app/auth/login/page.tsx**

- Login form
- Email/password validation
- Error handling
- Session management with NextAuth

### Step 3: Dashboard (1 day)

**app/dashboard/page.tsx**

- Overview for current user
- Quick actions
- Key metrics

### Step 4: Users Management (1 day)

**app/admin/users/page.tsx**

- User list with pagination
- CRUD operations
- Role assignment

### Step 5: Schools Management (1 day)

**app/admin/schools/page.tsx**

- School list
- School details
- Create/edit/delete schools

### Step 6: Students Management (2 days)

**app/students/page.tsx**

- Student list with search/filters
- Student 360° view
- Create/edit/delete students

### Step 7: Admissions Portal (2 days)

**app/admissions/apply/page.tsx** (Public)

- Application form
- Document upload
- Status tracking

**app/admin/admissions/page.tsx** (Admin)

- Application review
- Status management
- Decision workflow

### Step 8: Classes Management (1 day)

**app/admin/classes/page.tsx**

- Class list
- Enrollment management
- Class details

### Step 9: Attendance (2 days)

**app/attendance/mark/page.tsx**

- Mark attendance for class
- Bulk operations
- History view

### Step 10: Reports (2 days)

**app/reports/page.tsx**

- Attendance reports
- Student statistics
- Financial reports

---

## Testing Strategy

### Backend Tests

```bash
cd backend

# Unit tests
npm run test

# Test file: src/users/users.service.spec.ts
```

Example test:

```typescript
describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should create a user', async () => {
    const result = await service.create({ email: 'test@school.local', ...dto });
    expect(result.email).toBe('test@school.local');
  });
});
```

### Frontend Tests

```bash
cd frontend

# Component tests with Jest
npm run test
```

### E2E Tests

```bash
cd backend

# E2E tests with supertest
npm run test:e2e

# Test flow: Login → Create student → Mark attendance
```

---

## Database Migrations

### Creating a Migration

```bash
# Make a change to schema.prisma

# Create migration
docker-compose exec backend npx prisma migrate dev --name "add_new_field"

# Review generated SQL in prisma/migrations/
```

### Resetting Database (DEV ONLY)

```bash
# WARNING: This deletes all data
docker-compose exec backend npx prisma migrate reset
```

---

## Deployment Checklist

### Pre-Production

- [ ] All tests passing (>80% coverage)
- [ ] Security audit completed
- [ ] Load testing done (1000+ users)
- [ ] Database backups configured
- [ ] Monitoring setup (Prometheus/Grafana)
- [ ] Logging configured (ELK/Loki)
- [ ] SSL certificate obtained
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Seed data loaded

### Production Deployment

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Verify health
curl http://localhost:4000/health
curl http://localhost:3000
```

---

## Common Issues & Solutions

### Issue: "connection timeout" on backend startup

**Solution:**

```bash
# Ensure PostgreSQL is ready
docker-compose up -d postgres
sleep 10
docker-compose up -d

# Or manually wait for healthcheck
docker-compose logs postgres
```

### Issue: "LDAP connection refused"

**Solution:**

```bash
# OpenLDAP needs time to initialize
docker-compose logs openldap

# Wait for the LDAP server to be fully ready
docker-compose up -d openldap
sleep 20
```

### Issue: Port already in use

**Solution:**

```bash
# Find which service is using the port
lsof -i :3000  # or any port

# Kill the process
kill -9 <PID>

# Or change the port in docker-compose.yml
```

### Issue: Database migrations fail

**Solution:**

```bash
# Check migration status
docker-compose exec backend npx prisma migrate status

# Resolve issues
docker-compose exec backend npx prisma migrate resolve --rolled-back "migration_name"
```

---

## Performance Tuning

### Database

```sql
-- Add strategic indexes (in migrations)
CREATE INDEX idx_students_school ON students(school_id);
CREATE INDEX idx_attendance_date ON attendance(date);
```

### Backend

```typescript
// Use select for specific fields
const users = await prisma.user.findMany({
  select: { id: true, email: true, role: true },
});

// Pagination
const users = await prisma.user.findMany({
  skip: (page - 1) * limit,
  take: limit,
});

// Eager loading
const students = await prisma.student.findMany({
  include: { parents: true, enrollments: true },
});
```

### Frontend

```typescript
// Use dynamic imports for heavy components
const HeavyChart = dynamic(() => import('@/components/Chart'), {
  loading: () => <p>Loading...</p>,
});

// React Query for data fetching & caching
useQuery(['students'], () => fetcher.get('/students'));
```

---

## Useful Commands

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend

# Enter a container shell
docker-compose exec backend sh

# Run npm commands in container
docker-compose exec backend npm run test

# Database GUI
docker-compose exec backend npx prisma studio

# Rebuild an image
docker-compose up -d --build backend

# Stop specific service
docker-compose stop backend

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Check service health
docker-compose ps

# View service resource usage
docker stats
```

---

## Next Steps After Phase 1

Once Phase 1 is complete and stable:

1. **Phase 2**: Add academic modules (subjects, grades, bulletins)
2. **Phase 3**: Add financial modules (invoicing, payments)
3. **Phase 4**: Add communication (SMS, WhatsApp, email)
4. **Phase 5**: Add ERP modules (accounting, HR, inventory)
5. **Phase 7**: Integrate IA (Copilot features)
6. **Phase 8**: Add BI & analytics

---

## Support & Documentation

- **API Docs**: http://localhost:4000/api/docs
- **Database GUI**: `docker-compose exec backend npx prisma studio`
- **Issues**: GitHub Issues or internal documentation
- **Slack Channel**: #school-erp-dev

---

**Version**: 1.0  
**Last Updated**: 2025-09-11  
**Status**: Ready for Development
