# DevSecOps agentique — guide du projet GESTION SCHOOL

Ce dépôt intègre la méthode de l'**Agentic DevSecOps Kit** : l'agent de code (Claude Code, ou
opencode) travaille comme un ingénieur DevSecOps du projet. Tout est versionné, donc partagé par
toute l'équipe. Principe directeur : **AI-Augmented, not AI-Replaced** — l'agent propose, un test
ou un scan prouve, un humain décide.

## 1. Les cinq couches

| Couche | Fichiers | Rôle |
|---|---|---|
| **Règles** | `CLAUDE.md` | Ce que l'agent fait toujours / ne fait jamais ici : isolation `schoolId`, guards JWT + rôles, DTO, pas de secret, pas de dépendance non vérifiée, données de mineurs hors logs… |
| **Spécialistes** | `.claude/agents/*.md` | `security-reviewer` (OWASP, lecture seule) · `threat-modeler` (DFD + STRIDE) · `pipeline-hardener` (CI, Docker, compose) · `incident-analyst` (logs, post-mortem) |
| **Workflows** | `.claude/skills/*/SKILL.md` | `/security-review` · `/threat-model` · `/harden-dockerfile` · `/dependency-check` · `/incident-report` |
| **Garde-fous** | `.claude/settings.json` + `.claude/hooks/*.sh` | Bloquent automatiquement : commit/push avec un secret (Gitleaks), `--no-verify`, `npm install` d'un package inexistant (slopsquatting) ; Semgrep sur chaque fichier édité ; lecture de `.env`, `*.pem`, `certs/` interdite |
| **CI** | `.github/workflows/security-gates.yml` · `claude-security-review.yml` · `.github/dependabot.yml` | Scanners **bloquants** + revue IA **non bloquante** en commentaire de PR + mises à jour hebdomadaires |

opencode : `opencode.json` + `.opencode/` (agents et commandes **générés** depuis `.claude/` par
`scripts/sync-opencode.sh`, plugin `.opencode/plugins/devsecops-guards.js`). Détails : `docs/opencode.md`.

## 2. Mise en route (une fois par poste)

Outils appelés par les garde-fous et les skills — sans eux, le garde-fou **avertit au lieu de
bloquer** (un outil absent ne doit jamais ressembler à un contrôle réussi) :

```powershell
winget install Gitleaks.Gitleaks
winget install AquaSecurity.Trivy
pip install semgrep==1.177.0 checkov
```

Les hooks tournent sous **Git Bash** et lisent le JSON de Claude Code avec **node** (repli :
python). Sur Windows, `python3` est souvent l'alias du Microsoft Store qui échoue : c'est géré.

Vérifier que tout est chargé : dans Claude Code, `/agents` liste les 4 spécialistes et
`/security-review` est disponible. Le test qui compte — ceci doit être **bloqué** :

```bash
echo "AKIAIOSFODNN7EXAMPLE" > k.txt && git add k.txt
# demandez à l'agent de commiter : le garde-fou doit refuser.
git reset k.txt && rm k.txt
```

## 3. Activer la CI (une fois, sur GitHub)

1. **Secret** `ANTHROPIC_API_KEY` : *Settings → Secrets and variables → Actions* (pour la revue
   de PR par Claude). Sans lui, seul ce workflow échoue ; les gates fonctionnent.
2. **Branch protection** sur `main` (*Settings → Branches*) — sans elle, les gates ne bloquent rien :
   - Require a pull request before merging (1 approbation)
   - Require status checks to pass, et cocher :
     `Secrets (Gitleaks)` · `SAST (Semgrep)` · `Dépendances (npm audit)` ·
     `IaC & Dockerfiles (Checkov)` · `Image (Trivy) (backend)` · `Image (Trivy) (frontend)` ·
     `Cohérence du kit DevSecOps`
   - Ne **pas** rendre obligatoire `Claude Security Review` (l'IA commente, elle ne bloque pas).
3. **Private vulnerability reporting** : *Settings → Code security* (voir `SECURITY.md`).

## 4. Au quotidien

- **Vous codez avec l'agent** : les règles de `CLAUDE.md` s'appliquent en permanence.
- **« Revois la sécurité de ma branche »** ou `/security-review` → scanners + `security-reviewer`
  → verdict *Bloquant* / *Mergeable avec réserves*, tracé dans `docs/security/ai-log.md`.
- **Nouvelle route, nouveau service, exposition publique** → `/threat-model` met à jour
  `docs/security/threat-model.md`.
- **Ajout d'une dépendance** → `/dependency-check <package>` avant `npm install`.
- **Logs suspects, fuite, attaque** → `/incident-report`.
- **Après modification de `.claude/agents` ou `.claude/skills`** → `bash scripts/sync-opencode.sh`
  puis commiter `.opencode/` (vérifié en CI).

## 5. État initial (baseline du 2026-09-26) — ce que les gates vont signaler

Les gates reflètent la dette existante ; ils **vont échouer** sur la première PR tant qu'elle
n'est pas traitée. C'est voulu : ne pas les affaiblir, traiter la dette.

| Gate | Résultat local | Action recommandée |
|---|---|---|
| Gitleaks | 5 faux positifs historiques (JWT d'exemple tronqués dans `API_REFERENCE.md`) ; hors périmètre d'une PR | Aucune — voir `ai-log.md` |
| Semgrep | 0 finding | — |
| npm audit | 36 vulnérabilités (1 critical, 19 high) | `/dependency-check` en mode audit, puis montées de version (`bcrypt` 6, `@nestjs/cli` ≥ 11, `@typescript-eslint` 8, `next` à jour…) avec tests |
| Checkov | `CKV_DOCKER_3` sur les 2 Dockerfiles (root) | `/harden-dockerfile` (non-root, image épinglée, Node 18 est EOL → Node 22 LTS) |
| Trivy | non exécuté localement | attendu en échec tant que la base `node:18-alpine` n'est pas mise à jour |

Priorités suivantes proposées : (1) premier test Jest d'isolation `schoolId` (règle n°2 : aucun
test n'existe) ; (2) `/threat-model` ; (3) refuser le démarrage du backend avec le `JWT_SECRET`
par défaut hors dev ; (4) ne publier Postgres/Redis/LDAP que sur `127.0.0.1` dans `docker-compose.yml`.
