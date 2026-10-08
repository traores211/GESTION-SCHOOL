# URLs de test — School ERP

Toutes les adresses pour tester l'application en local (pile `docker compose up -d`).
Les identifiants d'exemple (`<id>`) correspondent aux données de démonstration du seed ; ils changent si la base est réinitialisée.

## 1. Services

| Service | URL | Remarque |
|---|---|---|
| Application (Next.js) | http://localhost:1300 | port hôte 1300 → 3000 dans le conteneur |
| API (NestJS) | http://localhost:4000/api | préfixe global `/api` |
| Documentation Swagger | http://localhost:4000/api/docs | développement uniquement |
| État de santé | http://localhost:4000/api/health | |
| Métriques | http://localhost:4000/api/metrics | |
| MailHog (e-mails sortants) | http://localhost:8025 | réinitialisation de mot de passe, notifications |
| Adminer (base de données) | http://localhost:8080 | `docker compose --profile tools up adminer` |

## 2. Comptes de démonstration

| Rôle | E-mail | Mot de passe |
|---|---|---|
| SUPER_ADMIN | admin@school.local | admin123 |
| ENSEIGNANT (Maths, SVT, HG, EPS) | k.kouassi@school.local | teach123 |
| ENSEIGNANT (Français) | y.diallo@school.local | teach123 |
| ENSEIGNANT (Anglais) | a.kone@school.local | teach123 |
| SECRETARY | secretaire@school.local | secret123 |
| COMPTABLE | comptable@school.local | compta123 |
| PARENT | parent@school.local | parent123 |
| PARENT | parent2@school.local | parent123 |
| PARENT | parent3@school.local | parent123 |

École de démonstration : code `DEMO-001`.

## 3. Pages publiques (sans connexion)

| Page | URL |
|---|---|
| Accueil | http://localhost:1300/ |
| Connexion | http://localhost:1300/login |
| Mot de passe oublié | http://localhost:1300/forgot-password |
| Réinitialisation du mot de passe | http://localhost:1300/reset-password (lien complet avec jeton reçu dans MailHog) |
| Inscription d'un établissement (SaaS) | http://localhost:1300/signup |
| Protection des données personnelles | http://localhost:1300/confidentialite |
| Vitrine de l'école | http://localhost:1300/ecole/DEMO-001 |
| Candidature en ligne | http://localhost:1300/ecole/DEMO-001/inscription |
| Suivi de candidature | http://localhost:1300/ecole/DEMO-001/suivi |
| Paiement en ligne | http://localhost:1300/pay/<transactionId> (lien généré depuis une facture) |
| Page 404 | http://localhost:1300/cette-page-n-existe-pas |

## 4. Pages privées (connexion requise)

Sans session, chacune redirige vers `/login?next=…`. La colonne « Rôles » reprend le menu (`frontend/src/components/Shell.tsx`) ; l'API applique les mêmes règles.

### Pilotage

| Page | URL | Rôles |
|---|---|---|
| Tableau de bord | http://localhost:1300/dashboard | personnel (admin, secrétariat, enseignant, comptable) |
| Synthèse & prévisions | http://localhost:1300/insights | admin, comptable |
| Emplois du temps | http://localhost:1300/timetable | personnel |
| Emplois du temps — gestion | http://localhost:1300/timetable/manage | personnel |
| Emplois du temps — planification | http://localhost:1300/timetable/planning | personnel |
| Emplois du temps — génération | http://localhost:1300/timetable/generate | personnel |
| Emplois du temps — conformité | http://localhost:1300/timetable/compliance | personnel |
| Emplois du temps — import | http://localhost:1300/timetable/import | personnel |

### Scolarité

| Page | URL | Rôles |
|---|---|---|
| Élèves | http://localhost:1300/students | enseignement, surveillance |
| Fiche élève | http://localhost:1300/students/882a0860-7291-4e6a-a386-ac5cd653ce80 | idem |
| Classes | http://localhost:1300/classes | enseignement, surveillance |
| Détail d'une classe | http://localhost:1300/classes/e8ab026a-e90b-4793-a430-2de6b439c3d7 | idem |
| Présence | http://localhost:1300/attendance | enseignement, surveillance |
| Entrées et sorties | http://localhost:1300/gate | enseignement, surveillance |
| Saisie rapide | http://localhost:1300/quick-entry | enseignement, surveillance |
| Notes & bulletins | http://localhost:1300/grades | admin, enseignant |
| Conseil de classe | http://localhost:1300/grades/council | admin, enseignant |
| Cahier de textes | http://localhost:1300/homework | enseignement |
| Vie scolaire | http://localhost:1300/discipline | enseignement, surveillance |
| Messages des parents | http://localhost:1300/inbox | admin, secrétariat |
| Admissions | http://localhost:1300/admissions | admin, secrétariat |
| Dossier d'admission | http://localhost:1300/admissions/cmuyoee6n006es8gat8cp5sz4 | idem |
| Années & passage | http://localhost:1300/promotion | admin |
| Parents | http://localhost:1300/parents | admin, secrétariat |

### Gestion

| Page | URL | Rôles |
|---|---|---|
| Personnel | http://localhost:1300/staff | admin |
| Droits d'un utilisateur | http://localhost:1300/users/<userId>/permissions | admin |
| Facturation | http://localhost:1300/billing | admin, secrétariat, comptable |
| Paie | http://localhost:1300/payroll | admin, comptable |
| Transport | http://localhost:1300/transport | admin, secrétariat |
| Imports Excel | http://localhost:1300/imports | personnel |
| Messages aux familles | http://localhost:1300/messaging | admin, secrétariat, comptable |
| Annonces & vitrine | http://localhost:1300/announcements | admin |
| Brouillon de la vitrine | http://localhost:1300/announcements/draft | admin |
| Journal d'audit | http://localhost:1300/audit | admin |
| Données personnelles | http://localhost:1300/privacy | admin |
| Établissements | http://localhost:1300/schools | SUPER_ADMIN, ADMIN_ORGANISATION |
| Domaines | http://localhost:1300/domains | SUPER_ADMIN, ADMIN_ORGANISATION, DIRECTOR |
| Plateforme | http://localhost:1300/platform | SUPER_ADMIN |

### Famille et compte

| Page | URL | Rôles |
|---|---|---|
| Mes enfants / Mon espace élève | http://localhost:1300/portal | PARENT, ELEVE |
| Mon compte (mot de passe, 2FA, sessions) | http://localhost:1300/account | tous |

## 5. API

Authentification : `POST http://localhost:4000/api/auth/login` avec `{ "email", "password" }` renvoie `accessToken` ; l'envoyer ensuite dans l'en-tête `Authorization: Bearer <accessToken>`. Les segments `:id`, `:studentId`, etc. sont à remplacer par un identifiant réel.

### `academic-years/academic-years.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/academic-years` |
| POST | `http://localhost:4000/api/academic-years` |
| PATCH | `http://localhost:4000/api/academic-years/:id/set-current` |

### `admissions/admissions.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/admissions` |
| GET | `http://localhost:4000/api/admissions` |
| GET | `http://localhost:4000/api/admissions/:id` |
| PATCH | `http://localhost:4000/api/admissions/:id` |
| POST | `http://localhost:4000/api/admissions/:id/transition` |
| PATCH | `http://localhost:4000/api/admissions/:id/status` |
| POST | `http://localhost:4000/api/admissions/:id/notes` |
| POST | `http://localhost:4000/api/admissions/:id/pieces` |
| PATCH | `http://localhost:4000/api/admissions/:id/pieces/:pieceId` |
| POST | `http://localhost:4000/api/admissions/:id/pieces/:pieceId/file` |
| GET | `http://localhost:4000/api/admissions/:id/pieces/:pieceId/file` |
| POST | `http://localhost:4000/api/admissions/:id/test` |
| POST | `http://localhost:4000/api/admissions/:id/interview` |
| GET | `http://localhost:4000/api/admissions/:id/classes` |
| POST | `http://localhost:4000/api/admissions/:id/class` |

### `announcements/announcements.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/announcements` |
| GET | `http://localhost:4000/api/announcements` |
| PATCH | `http://localhost:4000/api/announcements/:id` |
| DELETE | `http://localhost:4000/api/announcements/:id` |

### `app.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/health` |
| GET | `http://localhost:4000/api/metrics` |
| POST | `http://localhost:4000/api/client-errors` |

### `assistant/assistant-tools.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/assistant/tools/openapi.json` |
| GET | `http://localhost:4000/api/assistant/tools/overview` |
| GET | `http://localhost:4000/api/assistant/tools/students` |
| GET | `http://localhost:4000/api/assistant/tools/student` |
| GET | `http://localhost:4000/api/assistant/tools/overdue` |
| GET | `http://localhost:4000/api/assistant/tools/attendance` |
| GET | `http://localhost:4000/api/assistant/tools/timetable` |

### `assistant/assistant.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/assistant/status` |
| POST | `http://localhost:4000/api/assistant/chat` |

### `attendance/attendance.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/attendance/mark` |
| GET | `http://localhost:4000/api/attendance` |
| GET | `http://localhost:4000/api/attendance/today-stats` |
| GET | `http://localhost:4000/api/attendance/student/:studentId` |
| GET | `http://localhost:4000/api/attendance/justifications` |
| PATCH | `http://localhost:4000/api/attendance/:id/refuse-justification` |
| PATCH | `http://localhost:4000/api/attendance/:id/justify` |

### `audit/audit.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/audit` |
| GET | `http://localhost:4000/api/audit/filters` |

### `auth/auth.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/auth/login` |
| POST | `http://localhost:4000/api/auth/refresh` |
| POST | `http://localhost:4000/api/auth/logout` |
| POST | `http://localhost:4000/api/auth/forgot-password` |
| POST | `http://localhost:4000/api/auth/reset-password` |
| GET | `http://localhost:4000/api/auth/me` |
| GET | `http://localhost:4000/api/auth/schools` |
| POST | `http://localhost:4000/api/auth/switch-school` |
| POST | `http://localhost:4000/api/auth/change-password` |
| POST | `http://localhost:4000/api/auth/logout-all` |
| POST | `http://localhost:4000/api/auth/2fa/setup` |
| POST | `http://localhost:4000/api/auth/2fa/enable` |
| POST | `http://localhost:4000/api/auth/2fa/disable` |
| POST | `http://localhost:4000/api/auth/users/:id/revoke-sessions` |

### `billing/billing.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/billing/invoices` |
| GET | `http://localhost:4000/api/billing/invoices` |
| POST | `http://localhost:4000/api/billing/invoices/:id/cancel` |
| POST | `http://localhost:4000/api/billing/payments/:id/refund` |
| GET | `http://localhost:4000/api/billing/invoices/:id` |
| POST | `http://localhost:4000/api/billing/invoices/:id/payments` |
| POST | `http://localhost:4000/api/billing/invoices/:id/pay-link` |
| GET | `http://localhost:4000/api/billing/export/:kind` |
| GET | `http://localhost:4000/api/billing/students/:studentId/balance` |
| GET | `http://localhost:4000/api/billing/stats` |

### `billing/online/payments.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/payments/config` |
| GET | `http://localhost:4000/api/payments/cinetpay/notify` |
| POST | `http://localhost:4000/api/payments/cinetpay/notify` |
| GET | `http://localhost:4000/api/payments/:transactionId` |
| POST | `http://localhost:4000/api/payments/:transactionId/refresh` |
| POST | `http://localhost:4000/api/payments/:transactionId/simulate` |

### `bulletins/bulletins.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/bulletins/class/:classId/:termId` |
| GET | `http://localhost:4000/api/bulletins/class/:classId/:termId/pdf` |
| GET | `http://localhost:4000/api/bulletins/class/:classId/:termId/csv` |
| GET | `http://localhost:4000/api/bulletins/:studentId/:termId/suggestion` |
| GET | `http://localhost:4000/api/bulletins/:studentId/:termId` |
| PUT | `http://localhost:4000/api/bulletins/:studentId/:termId` |
| GET | `http://localhost:4000/api/bulletins/:studentId/:termId/pdf` |

### `classes/classes.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/classes` |
| GET | `http://localhost:4000/api/classes` |
| GET | `http://localhost:4000/api/classes/:id` |
| PATCH | `http://localhost:4000/api/classes/:id` |
| DELETE | `http://localhost:4000/api/classes/:id` |
| POST | `http://localhost:4000/api/classes/:id/archive` |
| POST | `http://localhost:4000/api/classes/:id/restore` |
| POST | `http://localhost:4000/api/classes/:id/move/:studentId` |
| POST | `http://localhost:4000/api/classes/:id/enroll/:studentId` |
| POST | `http://localhost:4000/api/classes/:id/unenroll/:studentId` |

### `dashboard/dashboard.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/dashboard/teacher` |
| GET | `http://localhost:4000/api/dashboard/platform` |
| GET | `http://localhost:4000/api/dashboard/overview` |
| GET | `http://localhost:4000/api/dashboard/filters` |
| GET | `http://localhost:4000/api/dashboard/analytics` |

### `discipline/discipline.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/discipline` |
| GET | `http://localhost:4000/api/discipline` |
| GET | `http://localhost:4000/api/discipline/stats` |
| PATCH | `http://localhost:4000/api/discipline/:id` |
| DELETE | `http://localhost:4000/api/discipline/:id` |

### `documents/documents.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/documents/family/:studentId` |
| GET | `http://localhost:4000/api/documents/family/:studentId/:id/file` |
| GET | `http://localhost:4000/api/documents` |
| POST | `http://localhost:4000/api/documents` |
| POST | `http://localhost:4000/api/documents/:id/replace` |
| PATCH | `http://localhost:4000/api/documents/:id` |
| GET | `http://localhost:4000/api/documents/:id/file` |
| DELETE | `http://localhost:4000/api/documents/:id` |

### `domains/domains.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/domains` |
| GET | `http://localhost:4000/api/domains/:id` |
| GET | `http://localhost:4000/api/domains/:id/verification` |
| POST | `http://localhost:4000/api/schools/:schoolId/domains` |
| PATCH | `http://localhost:4000/api/domains/:id` |
| POST | `http://localhost:4000/api/domains/:id/verify` |
| DELETE | `http://localhost:4000/api/domains/:id` |

### `domains/host.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/public/host` |

### `family/family.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/homework` |
| GET | `http://localhost:4000/api/homework` |
| DELETE | `http://localhost:4000/api/homework/:id` |
| GET | `http://localhost:4000/api/conversations` |
| GET | `http://localhost:4000/api/conversations/:id` |
| POST | `http://localhost:4000/api/conversations/:id/messages` |
| PATCH | `http://localhost:4000/api/conversations/:id/close` |
| GET | `http://localhost:4000/api/parent-portal/children/:studentId/homework` |
| GET | `http://localhost:4000/api/parent-portal/conversations` |
| POST | `http://localhost:4000/api/parent-portal/conversations` |
| GET | `http://localhost:4000/api/parent-portal/conversations/:id` |
| POST | `http://localhost:4000/api/parent-portal/conversations/:id/messages` |

### `gate/gate.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/gate/family/:studentId` |
| POST | `http://localhost:4000/api/gate/scan` |
| POST | `http://localhost:4000/api/gate/events` |
| GET | `http://localhost:4000/api/gate/events` |
| GET | `http://localhost:4000/api/gate/today` |
| GET | `http://localhost:4000/api/gate/students/:studentId/pick-up` |
| GET | `http://localhost:4000/api/gate/students/:studentId/card` |
| POST | `http://localhost:4000/api/gate/students/:studentId/card/renew` |

### `grades/grades.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/grades` |
| GET | `http://localhost:4000/api/grades/class/:classId` |
| GET | `http://localhost:4000/api/grades/student/:studentId` |
| GET | `http://localhost:4000/api/grades/bulletin/:studentId/:termId` |

### `imports/imports.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/imports` |
| GET | `http://localhost:4000/api/imports/:kind/template` |
| POST | `http://localhost:4000/api/imports/:kind` |

### `insights/insights.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/insights/weekly` |
| POST | `http://localhost:4000/api/insights/weekly/send` |
| GET | `http://localhost:4000/api/insights/forecast` |

### `messaging/messaging.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/messaging/status` |
| GET | `http://localhost:4000/api/messaging/logs` |
| PATCH | `http://localhost:4000/api/messaging/settings` |
| POST | `http://localhost:4000/api/messaging/test` |
| POST | `http://localhost:4000/api/messaging/reminders/overdue` |

### `notifications/notifications.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/notifications/push` |
| POST | `http://localhost:4000/api/notifications/push/devices` |
| DELETE | `http://localhost:4000/api/notifications/push/devices` |
| GET | `http://localhost:4000/api/notifications` |
| GET | `http://localhost:4000/api/notifications/preferences` |
| PUT | `http://localhost:4000/api/notifications/preferences` |
| GET | `http://localhost:4000/api/notifications/unread-count` |
| PATCH | `http://localhost:4000/api/notifications/:id/read` |
| PATCH | `http://localhost:4000/api/notifications/mark-all-read` |

### `parent-portal/parent-portal.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/parent-portal/invoices/:invoiceId/pay` |
| GET | `http://localhost:4000/api/parent-portal/children` |
| GET | `http://localhost:4000/api/parent-portal/children/:studentId` |
| GET | `http://localhost:4000/api/parent-portal/children/:studentId/bulletins` |
| GET | `http://localhost:4000/api/parent-portal/children/:studentId/bulletins/:termId/pdf` |
| GET | `http://localhost:4000/api/parent-portal/children/:studentId/discipline` |
| GET | `http://localhost:4000/api/parent-portal/children/:studentId/timetable` |
| POST | `http://localhost:4000/api/parent-portal/children/:studentId/absences/:attendanceId/justify` |

### `parents/parents.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/parents` |
| GET | `http://localhost:4000/api/parents` |
| GET | `http://localhost:4000/api/parents/:id` |
| PATCH | `http://localhost:4000/api/parents/:id` |
| PUT | `http://localhost:4000/api/parents/:id/students/:studentId` |
| DELETE | `http://localhost:4000/api/parents/:id` |

### `payroll/payroll.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/payroll/generate` |
| GET | `http://localhost:4000/api/payroll` |
| GET | `http://localhost:4000/api/payroll/stats` |
| PATCH | `http://localhost:4000/api/payroll/:id` |
| PATCH | `http://localhost:4000/api/payroll/:id/validate` |
| PATCH | `http://localhost:4000/api/payroll/:id/pay` |
| GET | `http://localhost:4000/api/payroll/:id/pdf` |

### `permissions/permissions.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/permissions/catalog` |
| GET | `http://localhost:4000/api/users/:id/permissions` |
| PUT | `http://localhost:4000/api/users/:id/permissions` |

### `platform/group.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/group/schools` |
| POST | `http://localhost:4000/api/group/schools` |
| PATCH | `http://localhost:4000/api/group/schools/:id` |
| GET | `http://localhost:4000/api/group/schools/:id/members` |
| POST | `http://localhost:4000/api/group/schools/:id/members` |
| DELETE | `http://localhost:4000/api/group/schools/:id/members/:userId` |

### `platform/platform.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/public/signup` |
| POST | `http://localhost:4000/api/public/signup` |
| GET | `http://localhost:4000/api/subscription` |
| GET | `http://localhost:4000/api/platform/organisations` |
| PATCH | `http://localhost:4000/api/platform/schools/:id` |
| PATCH | `http://localhost:4000/api/platform/organisations/:id` |
| POST | `http://localhost:4000/api/platform/organisations/:id/transition` |
| GET | `http://localhost:4000/api/platform/organisations/:id/history` |
| GET | `http://localhost:4000/api/subscription/quotas` |
| GET | `http://localhost:4000/api/platform/plans` |
| PATCH | `http://localhost:4000/api/platform/organisations/:id/quota` |
| GET | `http://localhost:4000/api/platform/certbot/hostnames` |

### `privacy/privacy.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/privacy/settings` |
| PATCH | `http://localhost:4000/api/privacy/settings` |
| GET | `http://localhost:4000/api/privacy/archived` |
| GET | `http://localhost:4000/api/privacy/school-export` |
| GET | `http://localhost:4000/api/privacy/students/:id/export` |
| POST | `http://localhost:4000/api/privacy/students/:id/anonymize` |

### `promotion/promotion.controller.ts`

| Méthode | URL |
|---|---|
| PATCH | `http://localhost:4000/api/academic-years/:id/status` |
| GET | `http://localhost:4000/api/promotion/preview` |
| POST | `http://localhost:4000/api/promotion/run` |
| POST | `http://localhost:4000/api/promotion/students/:studentId/reenrol` |
| GET | `http://localhost:4000/api/promotion/history` |
| GET | `http://localhost:4000/api/promotion/students/:studentId` |

### `public/public.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/public/schools/:code/showcase` |
| GET | `http://localhost:4000/api/public/schools/:code/showcase/preview` |
| POST | `http://localhost:4000/api/public/schools/:code/contact` |
| POST | `http://localhost:4000/api/public/schools/:code/admissions/track` |
| POST | `http://localhost:4000/api/public/schools/:code/admissions` |

### `showcase/showcase.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/showcase/settings` |
| GET | `http://localhost:4000/api/showcase/draft` |
| PUT | `http://localhost:4000/api/showcase/draft` |
| DELETE | `http://localhost:4000/api/showcase/draft` |
| POST | `http://localhost:4000/api/showcase/publish` |
| PATCH | `http://localhost:4000/api/showcase/settings` |
| POST | `http://localhost:4000/api/showcase/uploads` |
| POST | `http://localhost:4000/api/showcase/highlights` |
| PATCH | `http://localhost:4000/api/showcase/highlights/:id` |
| DELETE | `http://localhost:4000/api/showcase/highlights/:id` |
| POST | `http://localhost:4000/api/showcase/photos` |
| PATCH | `http://localhost:4000/api/showcase/photos/:id` |
| DELETE | `http://localhost:4000/api/showcase/photos/:id` |
| POST | `http://localhost:4000/api/showcase/partners` |
| PATCH | `http://localhost:4000/api/showcase/partners/:id` |
| DELETE | `http://localhost:4000/api/showcase/partners/:id` |
| POST | `http://localhost:4000/api/showcase/testimonials` |
| PATCH | `http://localhost:4000/api/showcase/testimonials/:id` |
| DELETE | `http://localhost:4000/api/showcase/testimonials/:id` |

### `smart-entry/smart-entry.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/smart-entry/capabilities` |
| POST | `http://localhost:4000/api/smart-entry/roll-call/parse` |
| POST | `http://localhost:4000/api/smart-entry/marks/parse` |
| POST | `http://localhost:4000/api/smart-entry/marks/image` |

### `staff/staff.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/staff` |
| GET | `http://localhost:4000/api/staff` |
| PATCH | `http://localhost:4000/api/staff/:id/status` |
| GET | `http://localhost:4000/api/staff/:id` |
| PATCH | `http://localhost:4000/api/staff/:id/profile` |
| PATCH | `http://localhost:4000/api/staff/:id/salary` |
| DELETE | `http://localhost:4000/api/staff/:id` |

### `students/students.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/students` |
| GET | `http://localhost:4000/api/students` |
| POST | `http://localhost:4000/api/students/:id/restore` |
| POST | `http://localhost:4000/api/students/:id/photo` |
| GET | `http://localhost:4000/api/students/:id/photo` |
| POST | `http://localhost:4000/api/students/:id/account` |
| DELETE | `http://localhost:4000/api/students/:id/account` |
| GET | `http://localhost:4000/api/students/:id` |
| PATCH | `http://localhost:4000/api/students/:id` |
| DELETE | `http://localhost:4000/api/students/:id` |

### `subjects/subjects.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/subjects` |
| GET | `http://localhost:4000/api/subjects` |
| PATCH | `http://localhost:4000/api/subjects/:id` |
| POST | `http://localhost:4000/api/subjects/:id/assign` |
| DELETE | `http://localhost:4000/api/subjects/:id` |

### `timetable/planning/planning.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/timetable/options` |
| GET | `http://localhost:4000/api/timetable/sessions/:id/suggestions` |
| POST | `http://localhost:4000/api/timetable/sessions/:id/swap` |
| PATCH | `http://localhost:4000/api/timetable/sessions/:id/lock` |
| POST | `http://localhost:4000/api/timetable/lock-class` |
| GET | `http://localhost:4000/api/timetable/history` |
| POST | `http://localhost:4000/api/timetable/history/:batchId/undo` |
| POST | `http://localhost:4000/api/timetable/generate/preview` |
| POST | `http://localhost:4000/api/timetable/generate/apply` |
| GET | `http://localhost:4000/api/timetable/compliance` |
| GET | `http://localhost:4000/api/timetable/export` |
| GET | `http://localhost:4000/api/timetable/planning` |
| GET | `http://localhost:4000/api/timetable/planning/template` |
| POST | `http://localhost:4000/api/timetable/planning/import/analyze` |
| POST | `http://localhost:4000/api/timetable/planning/import/commit` |

### `timetable/timetable.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/timetable/resources` |
| GET | `http://localhost:4000/api/timetable/sessions` |
| GET | `http://localhost:4000/api/timetable/conflicts` |
| POST | `http://localhost:4000/api/timetable/check` |
| POST | `http://localhost:4000/api/timetable/sessions` |
| PATCH | `http://localhost:4000/api/timetable/sessions/:id` |
| POST | `http://localhost:4000/api/timetable/sessions/:id/duplicate` |
| DELETE | `http://localhost:4000/api/timetable/sessions/:id` |
| GET | `http://localhost:4000/api/timetable/settings` |
| PATCH | `http://localhost:4000/api/timetable/settings` |
| GET | `http://localhost:4000/api/timetable/rooms` |
| POST | `http://localhost:4000/api/timetable/rooms` |
| PATCH | `http://localhost:4000/api/timetable/rooms/:id` |
| DELETE | `http://localhost:4000/api/timetable/rooms/:id` |
| GET | `http://localhost:4000/api/timetable/import/capabilities` |
| POST | `http://localhost:4000/api/timetable/import/analyze` |
| POST | `http://localhost:4000/api/timetable/import/resolve` |
| POST | `http://localhost:4000/api/timetable/import/preview` |
| POST | `http://localhost:4000/api/timetable/import/commit` |
| GET | `http://localhost:4000/api/timetable/imports` |
| DELETE | `http://localhost:4000/api/timetable/imports/:id` |

### `transport/transport.controller.ts`

| Méthode | URL |
|---|---|
| POST | `http://localhost:4000/api/transport/vehicles` |
| GET | `http://localhost:4000/api/transport/vehicles` |
| POST | `http://localhost:4000/api/transport/vehicles/:id/ping` |
| DELETE | `http://localhost:4000/api/transport/vehicles/:id` |
| POST | `http://localhost:4000/api/transport/routes` |
| GET | `http://localhost:4000/api/transport/routes` |
| GET | `http://localhost:4000/api/transport/routes/:id` |
| DELETE | `http://localhost:4000/api/transport/routes/:id` |
| POST | `http://localhost:4000/api/transport/routes/:id/subscribe/:studentId` |
| POST | `http://localhost:4000/api/transport/routes/:id/unsubscribe/:studentId` |

### `users/users.controller.ts`

| Méthode | URL |
|---|---|
| GET | `http://localhost:4000/api/users/me` |

## 6. Résultats de la campagne du 2026-10-07

Branche `feature/saas-multi-tenant`, pile Docker locale, données de démonstration.

| Campagne | Résultat | Commande |
|---|---|---|
| Pages publiques (9) | 9/9 répondent en 200 | sonde HTTP |
| Pages privées sans session (36) | 36/36 redirigent vers `/login?next=…` | sonde HTTP |
| Pages privées, cookie de session fourni (36) | 36/36 répondent en 200 | sonde HTTP |
| Connexion API des 5 rôles | 5/5 | `POST /api/auth/login` |
| API en lecture, compte admin (67 routes) | 65 en 200, 2 en 400 attendus (`/timetable/options` et `/documents` exigent un paramètre) | sonde HTTP |
| Cloisonnement des rôles (11 cas) | 11/11 refusés (403, 401 pour l'anonyme) | sonde HTTP |
| Tests unitaires backend | 35 suites, 295 tests, tous verts | `docker exec school-backend npx jest --runInBand` |
| Tests unitaires frontend | 5 fichiers, 30 tests, tous verts | `docker exec school-frontend npx vitest run` |
| E2E API, lanceur officiel | 28 suites sur 28, 617 vérifications | `docker exec school-backend sh test/run-e2e.sh` |
| E2E API hors lanceur | `e2e-lifecycle`, `e2e-quotas`, `e2e-domains`, `e2e-permissions` verts ; `e2e-import` 8/13, puis 13/13 après correction | `node test/<nom>.js` |
| Tests navigateur (Playwright) | 12 réussis, 15 en échec ; **25 réussis, 2 en échec après correction** | voir ci-dessous |

### Anomalies trouvées et corrections

Après correction : `e2e-auth` (24 vérifications), `e2e-planning` (38) et `e2e-import` (13/13) verts, Playwright 25/27 puis 27/27 une fois l'anomalie 4 corrigée.

Campagne complète rejouée le 2026-10-08 après les corrections : types backend sans erreur, 295 tests unitaires backend et 30 frontend verts, 28 suites E2E du lanceur vertes, les 5 scripts hors lanceur verts (`e2e-import` 13/13), sonde HTTP à 168 OK (mêmes 2 réponses 400 attendues), Playwright 27/27. Deux incidents d'environnement pendant cette campagne, sans lien avec le code : le moteur Docker (3,7 Go) a planté quand la suite navigateur a été lancée d'un bloc, et le test d'appel hors ligne a échoué une fois juste après le redémarrage (page encore en chargement à 30 s), puis réussi à la relance. Lancer Playwright en deux lots (`smoke records offline`, puis `a11y`) évite le premier.

**1. La connexion ne mène plus au tableau de bord dans le navigateur (bloquant).**
Après une connexion réussie, la navigation vers `/dashboard` est renvoyée vers `/login?next=%2Fdashboard`. Le middleware `frontend/src/middleware.ts` exige le cookie `erp_refresh` sur chaque page privée, alors que l'API le pose avec `Path=/api/auth` (`backend/src/auth/auth.controller.ts:20`) : le navigateur ne l'envoie donc jamais sur `/dashboard`. 13 des 15 échecs Playwright viennent de là (tous les parcours connectés : `smoke`, `records`, `a11y`, `offline`). La sonde HTTP ne le voit pas, car elle fournit le cookie à la main sans tenir compte du chemin.
*Corrigé :* l'API pose en plus un cookie marqueur `erp_session=1` (`Path=/`, sans secret), créé et supprimé en même temps que le jeton de rafraîchissement ; le middleware lit ce marqueur. Les sessions ouvertes avant la correction n'ont pas le marqueur : une reconnexion est nécessaire.

**2. Une adresse inconnue affiche la connexion au lieu de la page 404.**
`/cette-page-n-existe-pas` est traitée comme une page privée par le même middleware et redirigée vers `/login` pour un visiteur anonyme (2 échecs Playwright, bureau et mobile).
*Corrigé :* le middleware ne protège plus que les sections privées connues (liste `PRIVATE_SECTIONS`) ; toute autre adresse est laissée à Next, qui affiche la 404. Une nouvelle page privée doit être ajoutée à cette liste.

**3. `e2e-import` : 5 étapes renvoient 409.**
Le script date du premier emploi du temps et attend qu'un cours placé un dimanche soit créé avec un avertissement (201). Depuis l'ajout de la planification, l'API le refuse (« Dimanche n'est pas un jour de cours »), même avec `force: true`. Le script n'est pas dans `run-e2e.sh` et `e2e-planning` (38 vérifications) couvre le comportement actuel : test à mettre à jour ou à retirer. À vérifier tout de même : la modification des seules notes d'une séance importée est refusée en 409.
*Corrigé :* `TimetableService.update` n'applique plus les règles de planification quand seuls le libellé ou les notes changent ; le script vérifie désormais le refus du jour fermé (409, même forcé) et l'annotation d'une séance.

**4. Contraste insuffisant sur le tableau de bord.**
Révélé une fois la connexion réparée : les 2 tests `a11y` restants signalent `color-contrast` sur `/dashboard`, 24 éléments en thème clair et 12 en thème sombre (cartes `.stub`, texte en 12 px à un ratio d'environ 3,1 pour 4,5 attendu).
*Corrigé :* les cours terminés étaient estompés par `opacity: 0.6` ; ils le sont maintenant par la couleur `--ink-3` et une graisse plus légère (`frontend/src/app/globals.css`), ce qui garde le contraste. Le test `a11y` a aussi été fiabilisé : les animations sont neutralisées pendant l'audit (un état vide en plein fondu était mesuré comme un défaut de contraste) et le test du thème clair dispose de 480 s au lieu de 240 s pour ses 17 écrans. Les 6 tests `a11y` passent ; avec les 21 autres tests déjà verts, Playwright est à 27/27.

### Non couvert

- Paiement en ligne réel (CinetPay), envoi de SMS réel, assistant Dify : seuls les modes simulés/journalisés sont testés.
- Pages `/pay/<transactionId>` et `/users/<userId>/permissions` : non sondées (identifiant à générer).
- Parcours dans le navigateur une fois connecté : couverts seulement par les scénarios Playwright existants (connexion, élèves, facturation, admissions, audit, appel hors ligne).
