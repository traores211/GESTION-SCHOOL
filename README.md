# School ERP

Gestion scolaire pour établissements de Côte d'Ivoire : élèves, admissions, classes, **emplois du temps**,
présence, notes et bulletins, facturation (Mobile Money), transport, paie, vitrine publique et portail parents.

## Stack

- **Backend** : NestJS 10, TypeScript (strict), Prisma 5, PostgreSQL 16
- **Frontend** : Next.js 15 (App Router), React 18, TypeScript, design system CSS maison (`src/app/globals.css`), icônes Lucide
- **Import de documents** : ExcelJS (xlsx), pdf.js (PDF), Mammoth (docx), Tesseract.js (OCR des images), IA optionnelle (Claude)
- **Infra** : Docker Compose (Node 22), Redis, OpenLDAP, MailHog

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

## Tests

```bash
# Backend (unitaires : conflits, générateur, parseurs, normalisation, sécurité)
docker compose exec backend npx jest

# Frontend (logique de la grille, tri/recherche)
docker compose exec frontend npx vitest run

# Bout en bout contre la stack lancée (auth, permissions, CRUD, import xlsx/csv/docx/pdf ; ajouter un .png/.jpg au dossier pour tester l'OCR)
docker compose exec backend sh -c "npx ts-node test/make-fixtures.ts /tmp/fx && node test/e2e-import.js /tmp/fx"
```
