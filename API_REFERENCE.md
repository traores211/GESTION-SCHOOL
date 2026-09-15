# 🔌 API Endpoints Reference - Phase 1

Complete API endpoints specification for School ERP Phase 1.

**Base URL**: `http://localhost:4000/api`

**Authentication**: All endpoints except `/auth/login` and `/admissions/apply` require `Authorization: Bearer <token>`

---

## 🔐 Authentication Endpoints

### POST /auth/login
Login with email and password.

**Request:**
```json
{
  "email": "user@school.local",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-123",
    "email": "user@school.local",
    "firstName": "John",
    "lastName": "Doe",
    "role": "DIRECTOR"
  }
}
```

---

### POST /auth/login-ldap
Login via LDAP (for enterprise environments).

**Request:**
```json
{
  "email": "user@school.local",
  "password": "password123"
}
```

**Response (200):** Same as `/auth/login`

---

### POST /auth/refresh
Refresh an expired access token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### POST /auth/logout
Logout and invalidate tokens.

**Response (200):**
```json
{
  "message": "Logout successful"
}
```

---

### GET /auth/me
Get current authenticated user.

**Response (200):**
```json
{
  "id": "user-123",
  "email": "user@school.local",
  "firstName": "John",
  "lastName": "Doe",
  "role": "DIRECTOR",
  "school": {
    "id": "school-123",
    "name": "École Cocody",
    "code": "EC001"
  },
  "permissions": ["students:read", "students:create", "classes:read"]
}
```

---

### POST /auth/change-password
Change user password.

**Request:**
```json
{
  "currentPassword": "old123",
  "newPassword": "new123"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

---

## 👥 Users Endpoints

### GET /users
List all users (paginated, admin only).

**Query Parameters:**
- `page`: number (default: 1)
- `limit`: number (default: 20)
- `search`: string (search by email or name)
- `role`: UserRole (filter by role)
- `status`: UserStatus (filter by status)
- `orderBy`: string (default: "createdAt")
- `order`: "asc" | "desc" (default: "desc")

**Response (200):**
```json
{
  "data": [
    {
      "id": "user-123",
      "email": "director@school.local",
      "firstName": "John",
      "lastName": "Doe",
      "role": "DIRECTOR",
      "status": "ACTIVE",
      "school": { "id": "school-123", "name": "École Cocody" },
      "createdAt": "2025-01-15T10:30:00Z",
      "lastLogin": "2025-09-10T14:22:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

---

### POST /users
Create a new user.

**Request:**
```json
{
  "email": "newuser@school.local",
  "firstName": "Jane",
  "lastName": "Smith",
  "password": "securepass123",
  "role": "TEACHER",
  "schoolId": "school-123"
}
```

**Response (201):**
```json
{
  "id": "user-456",
  "email": "newuser@school.local",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "TEACHER",
  "status": "ACTIVE",
  "school": { "id": "school-123", "name": "École Cocody" }
}
```

---

### GET /users/{id}
Get a specific user.

**Response (200):**
```json
{
  "id": "user-123",
  "email": "director@school.local",
  "firstName": "John",
  "lastName": "Doe",
  "role": "DIRECTOR",
  "status": "ACTIVE",
  "school": { "id": "school-123", "name": "École Cocody" },
  "permissions": ["students:read", "students:create", "reports:read"],
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-09-10T14:22:00Z",
  "lastLogin": "2025-09-10T14:22:00Z"
}
```

---

### PATCH /users/{id}
Update a user.

**Request:**
```json
{
  "firstName": "Jonathan",
  "status": "ACTIVE",
  "role": "DIRECTOR"
}
```

**Response (200):** Updated user object

---

### DELETE /users/{id}
Delete a user (soft delete).

**Response (200):**
```json
{
  "message": "User deleted successfully"
}
```

---

## 🏢 Organisations Endpoints

### GET /organisations
List all organisations (admin only).

**Query Parameters:**
- `page`: number
- `limit`: number
- `search`: string
- `isActive`: boolean

**Response (200):**
```json
{
  "data": [
    {
      "id": "org-123",
      "name": "Education Group",
      "slug": "education-group",
      "email": "info@educationgroup.ci",
      "country": "Côte d'Ivoire",
      "subscriptionPlan": "STANDARD",
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": { "total": 3, "page": 1, "limit": 20, "pages": 1 }
}
```

---

### POST /organisations
Create a new organisation (super admin only).

**Request:**
```json
{
  "name": "New School Group",
  "slug": "new-school-group",
  "email": "contact@newsgroup.ci",
  "phone": "+225 123 456 789",
  "address": "123 Rue de l'École",
  "city": "Abidjan",
  "subscriptionPlan": "STARTER"
}
```

**Response (201):** New organisation object

---

### GET /organisations/{id}
Get organisation details.

**Response (200):** Organisation object with school list

---

### PATCH /organisations/{id}
Update organisation.

**Response (200):** Updated organisation object

---

## 🏫 Schools Endpoints

### GET /schools
List all schools in organisation.

**Query Parameters:**
- `page`: number
- `limit`: number
- `search`: string
- `isActive`: boolean

**Response (200):**
```json
{
  "data": [
    {
      "id": "school-123",
      "name": "École Cocody",
      "code": "EC001",
      "email": "contact@ecolecocody.ci",
      "city": "Cocody",
      "directeur": "Jean Kouadio",
      "isActive": true,
      "currentAcademicYear": "2025-2026",
      "maxStudentsPerClass": 50,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": { "total": 5, "page": 1, "limit": 20, "pages": 1 }
}
```

---

### POST /schools
Create a new school.

**Request:**
```json
{
  "name": "École Cocody",
  "code": "EC001",
  "email": "contact@ecolecocody.ci",
  "phone": "+225 123 456 789",
  "address": "123 Rue de Cocody",
  "city": "Cocody",
  "directeur": "Jean Kouadio",
  "maxStudentsPerClass": 50
}
```

**Response (201):** New school object

---

### GET /schools/{id}
Get school details with statistics.

**Response (200):**
```json
{
  "id": "school-123",
  "name": "École Cocody",
  "code": "EC001",
  "email": "contact@ecolecocody.ci",
  "city": "Cocody",
  "directeur": "Jean Kouadio",
  "isActive": true,
  "currentAcademicYear": "2025-2026",
  "statistics": {
    "totalStudents": 487,
    "totalClasses": 12,
    "totalTeachers": 25,
    "totalStaff": 35
  },
  "academicYears": [
    { "id": "year-123", "name": "2025-2026", "isCurrent": true },
    { "id": "year-122", "name": "2024-2025", "isCurrent": false }
  ]
}
```

---

### PATCH /schools/{id}
Update school.

**Response (200):** Updated school object

---

### DELETE /schools/{id}
Delete school.

**Response (200):** Success message

---

## 👨‍🎓 Students Endpoints

### GET /students
List all students (paginated).

**Query Parameters:**
- `page`: number
- `limit`: number
- `search`: string (search by name, matricule, email)
- `status`: StudentStatus
- `class`: string (class ID or code)
- `orderBy`: string

**Response (200):**
```json
{
  "data": [
    {
      "id": "student-123",
      "firstName": "Ahmed",
      "lastName": "Kouakou",
      "matricule": "STU-001-2025",
      "gender": "M",
      "dateOfBirth": "2010-05-15",
      "class": { "id": "class-123", "name": "5ème A", "level": "5ème" },
      "status": "INSCRIT",
      "attendance": {
        "present": 85,
        "absent": 5,
        "late": 10,
        "rate": "94.4%"
      }
    }
  ],
  "pagination": { "total": 487, "page": 1, "limit": 20, "pages": 25 }
}
```

---

### POST /students
Create a new student.

**Request:**
```json
{
  "firstName": "Youssouf",
  "lastName": "Traore",
  "dateOfBirth": "2010-03-20",
  "gender": "M",
  "nationality": "Côte d'Ivoire",
  "placeOfBirth": "Yamoussoukro",
  "address": "123 Rue de Yamoussoukro",
  "phone": "+225 123 456 789",
  "allergies": "None",
  "specialNeeds": "None"
}
```

**Response (201):** New student object with matricule

---

### GET /students/{id}
Get student 360° profile.

**Response (200):**
```json
{
  "id": "student-123",
  "firstName": "Ahmed",
  "lastName": "Kouakou",
  "matricule": "STU-001-2025",
  "dateOfBirth": "2010-05-15",
  "gender": "M",
  "nationality": "Côte d'Ivoire",
  "status": "INSCRIT",
  "user": { "id": "user-123", "email": "ahmed@school.local" },
  "parents": [
    {
      "id": "parent-123",
      "firstName": "Kouakou",
      "lastName": "Traore",
      "relationship": "Father",
      "phone": "+225 123 456 789",
      "email": "kouakou@email.ci"
    }
  ],
  "enrollments": [
    {
      "id": "enroll-123",
      "class": { "id": "class-123", "name": "5ème A" },
      "enrollmentDate": "2025-09-01",
      "withdrawalDate": null
    }
  ],
  "attendance": {
    "totalDays": 180,
    "presentDays": 170,
    "absentDays": 5,
    "lateDays": 5,
    "rate": "94.4%"
  },
  "documents": [
    { "id": "doc-123", "name": "Certificate", "type": "PDF" }
  ],
  "createdAt": "2025-01-15T10:30:00Z"
}
```

---

### PATCH /students/{id}
Update student information.

**Response (200):** Updated student object

---

### DELETE /students/{id}
Delete student (soft delete).

**Response (200):** Success message

---

### GET /students/{id}/attendance
Get student attendance history.

**Query Parameters:**
- `startDate`: ISO date
- `endDate`: ISO date
- `status`: AttendanceStatus

**Response (200):**
```json
{
  "student": { "id": "student-123", "firstName": "Ahmed", "lastName": "Kouakou" },
  "attendance": [
    {
      "id": "attend-123",
      "date": "2025-09-11",
      "status": "PRESENT",
      "entryTime": "08:00",
      "exitTime": "16:30",
      "class": { "id": "class-123", "name": "5ème A" }
    },
    {
      "id": "attend-124",
      "date": "2025-09-10",
      "status": "ABSENT",
      "reason": "Illness",
      "isJustified": true,
      "justification": "Medical certificate provided"
    }
  ],
  "statistics": {
    "period": { "start": "2025-09-01", "end": "2025-09-30" },
    "total": 20,
    "present": 19,
    "absent": 1,
    "late": 0,
    "rate": "95%"
  }
}
```

---

## 👨‍👩‍👧‍👦 Parents Endpoints

### GET /parents
List all parents (paginated).

**Response (200):**
```json
{
  "data": [
    {
      "id": "parent-123",
      "firstName": "Kouakou",
      "lastName": "Traore",
      "email": "kouakou@email.ci",
      "phone": "+225 123 456 789",
      "relationship": "Father",
      "profession": "Engineer",
      "students": [
        { "id": "student-123", "firstName": "Ahmed", "lastName": "Kouakou" }
      ]
    }
  ],
  "pagination": { "total": 1250, "page": 1, "limit": 20, "pages": 63 }
}
```

---

### POST /parents
Create a new parent.

**Request:**
```json
{
  "firstName": "Abiba",
  "lastName": "Sow",
  "email": "abiba@email.ci",
  "phone": "+225 987 654 321",
  "relationship": "Mother",
  "profession": "Doctor",
  "address": "456 Rue des Parents"
}
```

**Response (201):** New parent object

---

### PATCH /parents/{id}
Update parent information.

**Response (200):** Updated parent object

---

## 🏛️ Classes Endpoints

### GET /classes
List all classes (paginated).

**Query Parameters:**
- `page`: number
- `limit`: number
- `level`: string
- `academicYearId`: string
- `search`: string

**Response (200):**
```json
{
  "data": [
    {
      "id": "class-123",
      "name": "5ème A",
      "code": "5A-001",
      "level": "5ème",
      "capacity": 50,
      "enrollment": 47,
      "teacher": {
        "id": "staff-123",
        "firstName": "Marie",
        "lastName": "Dupont",
        "position": "Teacher"
      },
      "academicYear": { "id": "year-123", "name": "2025-2026" }
    }
  ],
  "pagination": { "total": 12, "page": 1, "limit": 20, "pages": 1 }
}
```

---

### POST /classes
Create a new class.

**Request:**
```json
{
  "name": "6ème A",
  "code": "6A-001",
  "level": "6ème",
  "capacity": 50,
  "academicYearId": "year-123",
  "teacherId": "staff-123"
}
```

**Response (201):** New class object

---

### GET /classes/{id}
Get class details.

**Response (200):**
```json
{
  "id": "class-123",
  "name": "5ème A",
  "code": "5A-001",
  "level": "5ème",
  "capacity": 50,
  "enrollment": 47,
  "teacher": {
    "id": "staff-123",
    "firstName": "Marie",
    "lastName": "Dupont",
    "position": "Teacher"
  },
  "academicYear": { "id": "year-123", "name": "2025-2026" },
  "students": [
    { "id": "student-123", "firstName": "Ahmed", "lastName": "Kouakou" },
    { "id": "student-124", "firstName": "Youssouf", "lastName": "Traore" }
  ],
  "statistics": {
    "totalStudents": 47,
    "averageAttendance": "94.2%",
    "averageGrade": null
  }
}
```

---

### GET /classes/{id}/students
List enrolled students in a class.

**Response (200):**
```json
{
  "class": { "id": "class-123", "name": "5ème A" },
  "students": [
    {
      "id": "student-123",
      "firstName": "Ahmed",
      "lastName": "Kouakou",
      "matricule": "STU-001-2025",
      "enrollmentDate": "2025-09-01"
    }
  ],
  "total": 47
}
```

---

### PATCH /classes/{id}
Update class information.

**Response (200):** Updated class object

---

### DELETE /classes/{id}
Delete class (if empty).

**Response (200):** Success message

---

## 🎓 Admissions Endpoints

### POST /admissions/apply
Submit an admission application (PUBLIC).

**Request:**
```json
{
  "firstName": "Mariama",
  "lastName": "Sow",
  "email": "mariama@email.ci",
  "phone": "+225 111 222 333",
  "dateOfBirth": "2010-06-20",
  "schoolId": "school-123",
  "academicYearId": "year-123",
  "documents": [
    { "type": "birth_certificate", "url": "..." },
    { "type": "vaccination", "url": "..." }
  ]
}
```

**Response (201):**
```json
{
  "id": "admission-123",
  "firstName": "Mariama",
  "lastName": "Sow",
  "status": "CANDIDATURE",
  "submittedAt": "2025-09-11T14:30:00Z",
  "trackingCode": "ADM-2025-123456"
}
```

---

### GET /admissions
List all admissions (admin only).

**Query Parameters:**
- `page`: number
- `limit`: number
- `status`: AdmissionStatus
- `schoolId`: string
- `academicYearId`: string
- `search`: string

**Response (200):**
```json
{
  "data": [
    {
      "id": "admission-123",
      "firstName": "Mariama",
      "lastName": "Sow",
      "email": "mariama@email.ci",
      "status": "DOSSIER_COMPLET",
      "submittedAt": "2025-09-05T10:00:00Z",
      "school": { "id": "school-123", "name": "École Cocody" },
      "academicYear": { "id": "year-123", "name": "2025-2026" }
    }
  ],
  "pagination": { "total": 156, "page": 1, "limit": 20, "pages": 8 }
}
```

---

### GET /admissions/{id}
Get admission details.

**Response (200):**
```json
{
  "id": "admission-123",
  "firstName": "Mariama",
  "lastName": "Sow",
  "email": "mariama@email.ci",
  "phone": "+225 111 222 333",
  "dateOfBirth": "2010-06-20",
  "status": "DOSSIER_COMPLET",
  "school": { "id": "school-123", "name": "École Cocody" },
  "academicYear": { "id": "year-123", "name": "2025-2026" },
  "documents": [
    { "id": "doc-123", "type": "birth_certificate", "url": "..." },
    { "id": "doc-124", "type": "vaccination", "url": "..." }
  ],
  "submittedAt": "2025-09-05T10:00:00Z",
  "updatedAt": "2025-09-10T16:45:00Z"
}
```

---

### PATCH /admissions/{id}/status
Update admission status.

**Request:**
```json
{
  "status": "ENTRETIEN",
  "notes": "Interview scheduled for 2025-09-20 at 10:00"
}
```

**Response (200):** Updated admission object

---

### GET /admissions/{id}/documents
Get uploaded documents for admission.

**Response (200):**
```json
{
  "admission": { "id": "admission-123", "firstName": "Mariama", "lastName": "Sow" },
  "documents": [
    {
      "id": "doc-123",
      "type": "birth_certificate",
      "fileName": "birth_cert_mariama.pdf",
      "uploadedAt": "2025-09-05T10:15:00Z",
      "url": "..."
    }
  ]
}
```

---

## 📋 Attendance Endpoints

### POST /attendance
Mark attendance for a class (bulk operation supported).

**Request (Single):**
```json
{
  "classId": "class-123",
  "studentId": "student-123",
  "date": "2025-09-11",
  "status": "PRESENT",
  "entryTime": "08:00",
  "exitTime": "16:30"
}
```

**Request (Bulk):**
```json
[
  { "classId": "class-123", "studentId": "student-123", "date": "2025-09-11", "status": "PRESENT" },
  { "classId": "class-123", "studentId": "student-124", "date": "2025-09-11", "status": "ABSENT", "reason": "Illness" },
  { "classId": "class-123", "studentId": "student-125", "date": "2025-09-11", "status": "RETARD" }
]
```

**Response (201):** Created attendance record(s)

---

### GET /attendance
List attendance records (filtered).

**Query Parameters:**
- `page`: number
- `limit`: number
- `classId`: string
- `studentId`: string
- `date`: ISO date
- `status`: AttendanceStatus
- `startDate`: ISO date
- `endDate`: ISO date

**Response (200):**
```json
{
  "data": [
    {
      "id": "attend-123",
      "student": { "id": "student-123", "firstName": "Ahmed", "lastName": "Kouakou" },
      "class": { "id": "class-123", "name": "5ème A" },
      "date": "2025-09-11",
      "status": "PRESENT",
      "entryTime": "08:00",
      "exitTime": "16:30"
    }
  ],
  "pagination": { "total": 2340, "page": 1, "limit": 20, "pages": 117 }
}
```

---

### PATCH /attendance/{id}
Update an attendance record.

**Request:**
```json
{
  "status": "ABSENCE_JUSTIFIÉE",
  "justification": "Medical certificate provided"
}
```

**Response (200):** Updated attendance object

---

### GET /attendance/stats
Get attendance statistics (filtered).

**Query Parameters:**
- `classId`: string
- `studentId`: string
- `startDate`: ISO date
- `endDate`: ISO date

**Response (200):**
```json
{
  "period": {
    "startDate": "2025-09-01",
    "endDate": "2025-09-30",
    "days": 20
  },
  "summary": {
    "total": 20,
    "present": 19,
    "absent": 1,
    "late": 0,
    "rate": "95%"
  },
  "byStatus": {
    "PRESENT": 19,
    "ABSENT": 1,
    "RETARD": 0,
    "ABSENCE_JUSTIFIÉE": 0
  }
}
```

---

## 🔍 Audit Endpoints

### GET /audit
List audit logs (admin only).

**Query Parameters:**
- `page`: number
- `limit`: number
- `userId`: string
- `resource`: string
- `action`: string
- `startDate`: ISO date
- `endDate`: ISO date

**Response (200):**
```json
{
  "data": [
    {
      "id": "audit-123",
      "action": "CREATE",
      "resource": "Student",
      "resourceId": "student-123",
      "user": { "id": "user-456", "email": "director@school.local" },
      "oldValues": null,
      "newValues": { "firstName": "Ahmed", "lastName": "Kouakou" },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2025-09-11T14:30:00Z"
    }
  ],
  "pagination": { "total": 5432, "page": 1, "limit": 20, "pages": 272 }
}
```

---

### GET /audit/export
Export audit logs (CSV or JSON).

**Query Parameters:**
- `format`: "csv" | "json"
- `resource`: string
- `startDate`: ISO date
- `endDate`: ISO date

**Response (200):** File download

---

## ❌ Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "timestamp": "2025-09-11T14:30:00Z",
  "path": "/api/students",
  "message": "Validation error",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate, etc.) |
| 500 | Internal Server Error |

---

## 📖 Pagination

All list endpoints support pagination:

```
GET /students?page=2&limit=50&orderBy=createdAt&order=desc
```

Response includes:

```json
{
  "data": [...],
  "pagination": {
    "total": 487,
    "page": 2,
    "limit": 50,
    "pages": 10
  }
}
```

---

## 🔐 Authorization Header

All protected endpoints require:

```
Authorization: Bearer <accessToken>
```

Example:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  http://localhost:4000/api/students
```

---

## 🔗 Response Timestamps

All timestamps are in ISO 8601 format (UTC):

```
2025-09-11T14:30:00Z
```

---

**API Version**: 1.0  
**Last Updated**: 2025-09-11  
**Status**: Ready for Implementation
