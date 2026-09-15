# Architecture School ERP - Phase 1

## Vue d'ensemble

School ERP est un système de gestion complet pour établissements scolaires, construit sur une architecture modulaire, multi-tenant et hautement sécurisée.

**Phase 1** se concentre sur :
- Authentification et autorisation (RBAC)
- Gestion des utilisateurs
- Gestion des établissements
- Gestion des élèves et inscriptions
- Gestion des classes et présence

## Architecture Technique

### Layers

```
┌─────────────────────────────────────────┐
│        Frontend (Next.js)                │
│  - React Components                     │
│  - TypeScript                           │
│  - Tailwind CSS                         │
│  - PWA Support                          │
└─────────────────┬───────────────────────┘
                  │ HTTPS/API
┌─────────────────▼───────────────────────┐
│      API Gateway / Reverse Proxy         │
│  - NGINX                                │
│  - Rate Limiting                        │
│  - SSL/TLS                              │
└─────────────────┬───────────────────────┘
                  │ HTTP
┌─────────────────▼───────────────────────┐
│        Backend (NestJS)                  │
│  - Controllers                          │
│  - Services                             │
│  - Guards & Interceptors                │
│  - Middlewares                          │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
┌───────▼────────┐   ┌───────▼────────┐
│   PostgreSQL   │   │     Redis      │
│   Database     │   │     Cache      │
└───────┬────────┘   └────────────────┘
        │
┌───────▼────────────────┐
│   External Services    │
│  - LDAP (Auth)         │
│  - Email (MailHog)     │
│  - SMS/WhatsApp (TBD)  │
│  - Mobile Money (TBD)  │
└────────────────────────┘
```

## Modularité Backend

```
src/
  ├── auth/
  │   ├── auth.controller.ts
  │   ├── auth.service.ts
  │   ├── auth.module.ts
  │   ├── guards/
  │   │   ├── jwt.guard.ts
  │   │   └── rbac.guard.ts
  │   └── strategies/
  │       ├── jwt.strategy.ts
  │       └── ldap.strategy.ts
  │
  ├── users/
  │   ├── users.controller.ts
  │   ├── users.service.ts
  │   ├── users.module.ts
  │   └── dto/
  │       ├── create-user.dto.ts
  │       └── update-user.dto.ts
  │
  ├── organisations/
  │   ├── organisations.controller.ts
  │   ├── organisations.service.ts
  │   ├── organisations.module.ts
  │
  ├── schools/
  │   ├── schools.controller.ts
  │   ├── schools.service.ts
  │   ├── schools.module.ts
  │
  ├── students/
  │   ├── students.controller.ts
  │   ├── students.service.ts
  │   ├── students.module.ts
  │   ├── dto/
  │   └── entities/
  │
  ├── admissions/
  │   ├── admissions.controller.ts
  │   ├── admissions.service.ts
  │   ├── admissions.module.ts
  │
  ├── classes/
  │   ├── classes.controller.ts
  │   ├── classes.service.ts
  │   ├── classes.module.ts
  │
  ├── attendance/
  │   ├── attendance.controller.ts
  │   ├── attendance.service.ts
  │   ├── attendance.module.ts
  │
  ├── common/
  │   ├── decorators/
  │   │   ├── current-user.decorator.ts
  │   │   ├── roles.decorator.ts
  │   │   └── require-permission.decorator.ts
  │   ├── filters/
  │   │   └── http-exception.filter.ts
  │   └── interceptors/
  │       ├── logging.interceptor.ts
  │       └── audit.interceptor.ts
  │
  ├── database/
  │   ├── database.module.ts
  │   ├── prisma.service.ts
  │   └── audit.service.ts
  │
  └── config/
      └── configuration.ts
```

## Modèle de Données

Voir `schema.prisma` pour la définition complète.

### Entities principales :

| Entity | Description | Relations |
|--------|-------------|-----------|
| **Organisation** | SaaS tenant | Schools, Users |
| **School** | Établissement | Organisation, Students, Classes, Staff |
| **User** | Utilisateur du système | Organisation, School, Permissions |
| **Student** | Élève | School, Parents, Classes, Attendance |
| **Parent** | Parent/Tuteur | Students |
| **StaffMember** | Personnel/Enseignant | School, Classes, Attendance |
| **Class** | Classe scolaire | School, AcademicYear, Students, Attendance |
| **AcademicYear** | Année scolaire | School, Classes, Admissions |
| **Admission** | Candidature/Admission | School, Student, AcademicYear |
| **Enrollment** | Inscription classe | Class, Student |
| **Attendance** | Présence/Absence | School, Class, Student, Staff |
| **AuditLog** | Journal d'audit | Organisation, School, User |
| **Permission** | Permission utilisateur | Users |
| **Notification** | Notification | User |

## Flux d'Authentification

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │ POST /auth/login
       │ {email, password}
       ▼
┌──────────────────┐
│  Auth.Controller │
└──────┬───────────┘
       │
       ▼
┌──────────────────────────┐
│  Auth.Service            │
│  1. Validate LDAP/DB     │
│  2. Check 2FA if needed  │
│  3. Generate JWT         │
│  4. Log audit            │
└──────┬───────────────────┘
       │
       ├─── JWT Token (24h exp)
       └─── Refresh Token (revocable)
       
       │
       │ Subsequent requests
       │ Authorization: Bearer <JWT>
       ▼
┌──────────────────┐
│  JwtGuard        │
│  - Verify JWT    │
│  - Extract User  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  RbacGuard       │
│  - Check Role    │
│  - Check Perms   │
└──────┬───────────┘
       │
       ▼
  ✅ Access Granted
```

## Flux Multi-Tenant

```
User Login
    │
    ├─ LDAP Sync (if LDAP-enabled)
    │   └─ Create/Update User in DB
    │
    ├─ Check Organisation (from email domain)
    │   └─ Fetch available schools
    │
    ├─ Select School (if multiple)
    │   └─ Set schoolId in JWT context
    │
    └─ Load permissions for role/school
        └─ Enforce data isolation
```

## Sécurité

### Principes

1. **Data Isolation** : Les utilisateurs ne voient que les données de leur organisation/établissement
2. **RBAC** : Role-Based Access Control avec permissions granulaires
3. **Audit Trail** : Tous les changements sont enregistrés
4. **Password Security** : Bcrypt + salt, jamais stocké en clair
5. **JWT Security** : Tokens signés, expiration 24h
6. **LDAP Integration** : Synchronisation avec annuaire d'entreprise
7. **Rate Limiting** : Protection contre brute force et DDoS
8. **HTTPS Mandatory** : TLS en production

### Guards & Middlewares

```
Request
  │
  ├─ CorsMiddleware
  ├─ HelmetMiddleware (Security headers)
  ├─ LoggerMiddleware
  │
  ▼
JwtGuard (si @UseGuards(JwtGuard))
  - Vérifie le JWT token
  - Extrait l'utilisateur
  │
  ▼
RbacGuard (si @UseGuards(RbacGuard))
  - Vérifie le rôle
  - Vérifie les permissions
  │
  ▼
Handler/Service
  │
  ▼
AuditInterceptor
  - Enregistre l'action
  - Valide les changements
```

## DTOs & Validation

Tous les inputs sont validés avec **class-validator** et **Zod**.

```typescript
// Example: CreateUserDto
export class CreateUserDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Password must contain uppercase' })
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}
```

## Services & Business Logic

### Structure Service

```typescript
@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // Create
  async create(schoolId: string, dto: CreateStudentDto) {
    const student = await this.prisma.student.create({
      data: { ...dto, schoolId },
    });
    
    await this.audit.log({
      action: 'CREATE',
      resource: 'Student',
      resourceId: student.id,
      newValues: student,
    });
    
    return student;
  }

  // Read
  async findAll(schoolId: string) {
    return this.prisma.student.findMany({
      where: { schoolId },
      include: { parents: true, enrollments: true },
    });
  }

  // Update
  async update(schoolId: string, id: string, dto: UpdateStudentDto) {
    const oldStudent = await this.prisma.student.findUnique({
      where: { id },
    });

    const updated = await this.prisma.student.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      action: 'UPDATE',
      resource: 'Student',
      resourceId: id,
      oldValues: oldStudent,
      newValues: updated,
    });

    return updated;
  }

  // Delete
  async remove(schoolId: string, id: string) {
    const student = await this.prisma.student.delete({
      where: { id },
    });

    await this.audit.log({
      action: 'DELETE',
      resource: 'Student',
      resourceId: id,
      oldValues: student,
    });

    return student;
  }
}
```

## Controllers

```typescript
@Controller('students')
@UseGuards(JwtGuard, RbacGuard)
@RequirePermission('students', 'read')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @RequirePermission('students', 'create')
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: User) {
    return this.studentsService.create(user.schoolId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.studentsService.findAll(user.schoolId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('students', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto, @CurrentUser() user: User) {
    return this.studentsService.update(user.schoolId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('students', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.studentsService.remove(user.schoolId, id);
  }
}
```

## API Endpoints - Phase 1

### Authentication

```
POST   /auth/login              - Login with email/password
POST   /auth/login-ldap         - Login with LDAP
POST   /auth/refresh            - Refresh JWT token
POST   /auth/logout             - Logout
GET    /auth/me                 - Current user info
POST   /auth/change-password    - Change password
```

### Users

```
GET    /users                   - List users (paginated)
POST   /users                   - Create user
GET    /users/:id               - Get user
PATCH  /users/:id               - Update user
DELETE /users/:id               - Delete user
```

### Organisations

```
GET    /organisations           - List organisations (admin only)
POST   /organisations           - Create organisation
GET    /organisations/:id       - Get organisation
PATCH  /organisations/:id       - Update organisation
```

### Schools

```
GET    /schools                 - List schools in organisation
POST   /schools                 - Create school
GET    /schools/:id             - Get school
PATCH  /schools/:id             - Update school
```

### Students

```
GET    /students                - List students (with filters)
POST   /students                - Create student
GET    /students/:id            - Get student (360° view)
PATCH  /students/:id            - Update student
DELETE /students/:id            - Delete student
GET    /students/:id/attendance - Student attendance history
```

### Classes

```
GET    /classes                 - List classes
POST   /classes                 - Create class
GET    /classes/:id             - Get class details
PATCH  /classes/:id             - Update class
DELETE /classes/:id             - Delete class
GET    /classes/:id/students    - List enrolled students
```

### Admissions

```
POST   /admissions              - Submit application (public)
GET    /admissions              - List admissions (admin)
PATCH  /admissions/:id/status   - Update admission status
GET    /admissions/:id/documents - Get uploaded documents
```

### Attendance

```
POST   /attendance              - Mark attendance
GET    /attendance              - List attendance records (filtered)
PATCH  /attendance/:id          - Update attendance entry
GET    /attendance/stats        - Attendance statistics
```

### Audit

```
GET    /audit                   - List audit logs (admin)
GET    /audit/export            - Export audit trail
```

## Pagination & Filtering

Tous les endpoints GET avec listes supportent :

```
GET /students?page=1&limit=20&search=name&status=INSCRIT&orderBy=createdAt&order=desc
```

Response format:
```json
{
  "data": [...],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

## Error Handling

```typescript
// Centralized error filter
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getMessage();
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
```

## Testing Strategy - Phase 1

### Unit Tests

- Services logic
- Guards & authorization
- Validators

### Integration Tests

- Full request/response flow
- Database transactions
- LDAP integration

### E2E Tests

- User login → admission → enrollment flow
- Attendance marking
- Class management

## Performance Considerations

1. **Database Indexes** : Strategic indexes on frequently queried columns
2. **Query Optimization** : Eager loading with `include/select` in Prisma
3. **Caching** : Redis for sessions, frequently accessed data
4. **Pagination** : Default limit=20, max=100
5. **Connection Pooling** : PostgreSQL connection pool

## Deployment Strategy

### Development

```bash
docker-compose up -d
```

### Staging/Production

- Environment-specific .env files
- Docker images built from Dockerfile
- Kubernetes or Docker Swarm for orchestration
- HTTPS with Let's Encrypt
- Database backups (automated daily)
- Monitoring & alerting (Prometheus/Grafana)

## Next Steps - Phase 2

Once Phase 1 is complete :

1. **Academic Module** : Subjects, timetables, grades
2. **Billing Module** : Invoicing, payment tracking
3. **Communication** : SMS, Email, WhatsApp notifications
4. **BI/Analytics** : Dashboards, KPIs
5. **IA Integration** : Copilot features

---

**Version** : 1.0 - Phase 1  
**Last Updated** : 2025  
**Status** : In Development
