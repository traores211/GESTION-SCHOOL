# School ERP

Plateforme SaaS multi-tenant de gestion scolaire pour établissements de Côte d'Ivoire : élèves,
admissions, classes, **emplois du temps**, présence, notes et bulletins, facturation
(Mobile Money), transport, paie, vitrine publique et portail parents.

Chaque établissement peut utiliser son propre nom de domaine (par exemple `mon-ecole-1.ci`),
avec son abonnement, ses quotas, son cycle de vie et ses permissions fines. Un groupe scolaire
peut gérer plusieurs écoles sous une même organisation.

## Stack

- **Backend** : NestJS 10, TypeScript (strict), Prisma 5, PostgreSQL 16, Redis 7
- **Frontend** : Next.js 15 (App Router), React 18, TypeScript, design system CSS maison (`src/app/globals.css`), icônes Lucide
- **Authentification** : JWT (access 15 min + refresh rotatif 30 j en cookie HttpOnly), 2FA TOTP, verrouillage anti-bruteforce
- **Multi-tenant** : organisations, écoles, domaines personnalisés (vérification DNS TXT + certificats Let's Encrypt automatiques), plans STARTER / PRO / ENTERPRISE avec quotas et overrides
- **Import de documents** : ExcelJS (xlsx), pdf.js (PDF), Mammoth (docx), Tesseract.js (OCR des images), IA optionnelle (Claude)
- **Infra** : Docker Compose (Node 22), Mailhog en dev, nginx + certbot + backup chiffrés en prod

## Démarrage

```bash
cp .env.example .env        # puis adapter les secrets
docker compose up -d --build
docker compose logs -f backend
```

Au démarrage, le backend synchronise ses dépendances, applique le schéma Prisma (`db push`, jamais avec
`--accept-data-loss`) et charge les données de démonstration si la base est vide (`SEED_ON_EMPTY_DB=false` pour désactiver),
y compris un emploi du temps sans conflit. Le premier démarrage prend quelques minutes.

| Service | URL |
|---|---|
| Application | http://localhost:1300 |
| API | http://localhost:4000/api |
| Documentation API (Swagger) | http://localhost:4000/api/docs |
| Santé (API + base) | http://localhost:4000/api/health |
| MailHog | http://localhost:8025 |

Postgres, Redis et LDAP ne sont pas exposés sur l'hôte : `docker compose exec postgres psql -U schooladmin school_erp`.

### Réinstallation complète

```bash
docker compose down -v --remove-orphans --rmi local   # -v supprime AUSSI la base de données
docker compose build --no-cache
docker compose up -d
```

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Super administrateur | admin@school.local | admin123 |
| Enseignant | k.kouassi@school.local | teach123 |
| Secrétariat | secretaire@school.local | secret123 |
| Comptabilité | comptable@school.local | compta123 |
| Parent | parent@school.local | parent123 |

### Données de volume et écoles de test

```bash
docker compose exec backend npm run seed:bulk
```

Ajoute environ 2 550 élèves, avec leurs parents, l'appel de chaque jour de classe, les notes des trois trimestres, trois tranches de scolarité et leurs paiements (Mobile Money, espèces, banque), les admissions, le transport et la paie mensuelle. Le script complète DEMO-001 (de la 6ème à la Terminale) et crée quatre écoles de test. Il est idempotent (une école déjà remplie est ignorée) et déterministe.

| École | Ville | Organisation | Comptes (mot de passe `demo123`) |
|---|---|---|---|
| Lycée Moderne Les Palmiers (LMP-BKE) | Bouaké | Demo School Group | `directeur@lmp-bke.local`, `comptable@lmp-bke.local`, `secretariat@lmp-bke.local` |
| Collège Saint-Paul (CSP-YAM) | Yamoussoukro | Demo School Group | `directeur@csp-yam.local`… |
| École Primaire Les Cocotiers (EPC-SPD) | San-Pédro | Demo School Group | `directeur@epc-spd.local`… |
| Institut Technique du Nord (ITN-KGO) | Korhogo | Réseau des Écoles Techniques du Nord | `directeur@itn-kgo.local`… |

Les enseignants de chaque école se connectent avec `prof01@<code>.local`, `prof02@<code>.local`… L'école de Korhogo appartient à une autre organisation : elle sert à vérifier l'isolement des données. Le super administrateur de DEMO-001 voit la comparaison des quatre écoles du groupe dans le tableau de bord (section « Réseau d'établissements »).
## Rôles et permissions

Les droits sont appliqués **par l'API** (`backend/src/common/roles.ts` + `RolesGuard`) ; le menu ne fait que les refléter.

| Groupe | Rôles | Exemples |
|---|---|---|
| Direction | SUPER_ADMIN, ADMIN_ORGANISATION, DIRECTOR | classes, matières, personnel, vitrine |
| Secrétariat | + SECRETARY | élèves, parents, admissions, transport, emplois du temps |
| Enseignement | + ENSEIGNANT | présence, notes (lecture élèves/classes, EDT en lecture) |
| Finance | Direction + COMPTABLE | paie ; facturation (+ secrétariat) |
| Parent | PARENT | portail « Mes enfants » uniquement |

## Emplois du temps

- **Éditeur visuel** (`/timetable`) : vues classe / enseignant / salle, semaine ou jour, glisser-déposer, redimensionnement,
  création par clic, déplacement au clavier (Alt + flèches), duplication, périodes (trimestres).
- **Détection des conflits** (enseignant, salle, classe, chevauchements, créneau invalide ; avertissements pour pauses,
  jours fermés et hors horaires) calculée côté serveur, affichée en direct pendant l'édition. Un conflit n'est enregistré
  que sur confirmation explicite et reste signalé.
- **Ressources** (`/timetable/manage`) : salles, couleurs des matières, jours/horaires/pauses, historique des imports (annulables).

### Import de fichiers (`/timetable/import`)

```
Fichier → détection du type (signature binaire) → parseur (xlsx / csv / pdf / docx / image OCR)
        → extraction (grille jours × horaires, liste, texte libre, ou IA) → normalisation (jours, heures, noms)
        → rapprochement avec les classes/matières/enseignants/salles → vérification et corrections par l'utilisateur
        → validation + génération (placement automatique des volumes horaires) + détection des conflits
        → aperçu → import → éditeur
```

Rien n'est enregistré avant la validation finale ; les rapprochements incertains doivent être confirmés ; les enseignants ne
sont jamais créés automatiquement. Code : `backend/src/timetable/import/` (un parseur par format, extracteurs séparés,
`ai/` pour le fournisseur IA).

**IA (optionnelle)** : définir `ANTHROPIC_API_KEY` (et éventuellement `TIMETABLE_AI_MODEL`) active l'option « Analyser avec
l'IA » pour les documents complexes, photos et PDF scannés. Chaque ligne interprétée par l'IA est marquée « à vérifier ».

## Multi-tenant SaaS

Chaque école vit dans une **organisation**. Un domaine personnalisé (`mon-ecole-1.ci`) est
associé à une école via la table `SchoolDomain` : vérification DNS TXT côté administration,
puis `GET /api/public/host` résout l'hôte en identité publique de l'école. En production, le
service `certbot` du compose obtient les certificats Let's Encrypt automatiquement et écrit un
snippet nginx par domaine.

- **Cycle de vie école** : `PROSPECT → PENDING → TRIAL → ACTIVE → SUSPENDED → EXPIRED → CLOSED`,
  transitions validées côté serveur, timeline auditée dans `SchoolLifecycleEvent`, auto-expiry
  du trial. UI : `/platform` → bouton « Historique ».
- **Plans & quotas** : STARTER (300 élèves, 25 comptes, 1 école, 0 domaine perso, 1 Go) /
  PRO (1 500 / 100 / 60 classes / 1 domaine / 10 Go + IA + vitrine) / ENTERPRISE (illimité
  sauf 10 domaines). Un dépassement renvoie **409 QUOTA_EXCEEDED** ; le SUPER_ADMIN peut
  poser un override par organisation sans toucher aux plans en code.
- **Permissions fines** : 17 permissions typées (`billing:refund`, `payroll:validate`,
  `privacy:erase`…) accordables à un compte précis par-dessus son rôle. UI :
  `/users/[id]/permissions`.
- **Adminer** (dev uniquement) : `docker compose --profile tools up adminer`, puis
  http://localhost:8080.

Détails et compte-rendu lot par lot : [`docs/EVOLUTION-SAAS.md`](docs/EVOLUTION-SAAS.md).

## Tests

```bash
# Backend (unitaires : conflits, générateur, parseurs, normalisation, sécurité)
docker compose exec backend npm test

# Frontend (logique de la grille, tri/recherche)
docker compose exec frontend npx vitest run

# Bout en bout contre la stack lancée (auth, permissions, CRUD, import xlsx/csv/docx/pdf ; ajouter un .png/.jpg au dossier pour tester l'OCR)
docker compose exec backend sh -c "npx ts-node test/make-fixtures.ts /tmp/fx && node test/e2e-import.js /tmp/fx"

# E2E spécifiques SaaS (chaque fichier teste un lot)
docker compose exec backend node test/e2e-domains.js        # domaines personnalisés (L1)
docker compose exec backend node test/e2e-lifecycle.js      # cycle de vie école (L2)
docker compose exec backend node test/e2e-quotas.js         # plans & quotas (L3)
docker compose exec backend node test/e2e-permissions.js    # permissions fines (L4)
```
