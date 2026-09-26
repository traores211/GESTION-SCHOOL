---
name: harden-dockerfile
description: Durcir un Dockerfile selon les 4 principes (minimal, non-root, pinned, scanned), avec preuve Trivy avant/après et vérification que l'application tourne toujours. À utiliser quand l'utilisateur demande de sécuriser une image, corriger des CVE d'image, ou avant de publier une image sur un registry.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent
---

# /harden-dockerfile — Durcir une image

## Étapes
Cibles du projet : `backend/Dockerfile` (NestJS, santé `GET /api/health` sur :4000, Prisma a besoin d'`openssl`) et `frontend/Dockerfile` (Next.js, :3000). Traiter une image à la fois ; `<svc>` = `backend` ou `frontend`, contexte de build = `./<svc>`.

Attention : les Dockerfiles actuels servent le **dev** (`npm run dev`, sources montées par `docker-compose.yml`). Une image de production durcie (multi-stage, `npm ci --omit=dev`, `nest build` / `next build` + `output: 'standalone'`) doit rester compatible avec le compose de dev, ou passer par un `Dockerfile.prod` / une cible `--target` distincte — à valider avec l'humain avant d'appliquer.

1. **Baseline** : `docker build -t <svc>:before ./<svc>` puis `trivy image --severity HIGH,CRITICAL <svc>:before | tee docs/security/trivy-<svc>-before.txt` ; `docker run --rm <svc>:before whoami` ; `docker history <svc>:before` (repérer `COPY . .`, secrets, couches inutiles). Noter taille (`docker images <svc>:before`).
2. **Diagnostic** contre les 4 principes :
   - *Minimal* : base `-slim`/`alpine`/distroless adaptée ; pas d'outils de build dans l'image finale (multi-stage).
   - *Non-root* : `USER` avec UID fixe ≥ 10000 ; fichiers `--chown`.
   - *Pinned* : tag précis (ou digest) pour la base, versions épinglées des dépendances, pas de `latest`.
   - *Scanned* : Trivy en CI avec `exit-code: 1` sur CRITICAL.
   Plus : `.dockerignore` (`.git`, `.env`, tests, docs, `*.db`), pas de secret en `ARG`/`ENV`, `--no-cache-dir`, `HEALTHCHECK` si pertinent.
3. **Appliquer** les corrections (déléguer à `pipeline-hardener` si le changement est large), avec un commentaire par choix non évident.
4. **Prouver** : `docker build -t <svc>:after ./<svc>` ; `trivy image --severity HIGH,CRITICAL <svc>:after | tee docs/security/trivy-<svc>-after.txt` ; `docker run --rm <svc>:after whoami` (≠ root) ; `docker compose up -d --build <svc>` puis `curl -f http://localhost:4000/api/health` (backend) / `curl -f http://localhost:3000` (frontend) ; si possible `docker run --read-only --cap-drop ALL` et vérifier qu'elle répond.
5. **Résumer** : tableau avant/après (taille, nb CRITICAL/HIGH, utilisateur), CVE restantes sans correctif upstream (à accepter explicitement), et rappel d'ajouter/garder le job `image-scan` bloquant en CI.

## Interdits
Ne pas ignorer une CVE via un fichier d'exclusion sans justification écrite. Ne pas casser l'application pour faire baisser le score : chaque durcissement est vérifié par un démarrage réel.
