---
name: security-review
description: Revue de sécurité complète des changements en cours (diff vs main) avant d'ouvrir une PR — scanners + relecture OWASP par le sous-agent security-reviewer + vérification des tests. À utiliser quand l'utilisateur dit "revois la sécurité", "avant la PR", "audit ce code", ou avant tout merge touchant auth, données, CI ou infra.
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# /security-review — Revue de sécurité avant PR

Objectif : produire un verdict fiable **Mergeable / Bloquant** avec des preuves, sans modifier le code.

## Étapes
1. **Périmètre** : `git diff --name-only main...HEAD` (ou la cible indiquée). Si la branche est `main`, demander quels fichiers relire.
2. **Scanners automatiques** (exécuter, ne pas interpréter à la place des outils) :
   - Secrets : `gitleaks detect --source . --redact --no-banner`
   - SAST : `semgrep scan --config p/owasp-top-ten --config p/secrets --config p/typescript --metrics=off <fichiers modifiés>`
   - SCA : `npm audit --audit-level=high` (à la racine)
   - Si un Dockerfile / `docker-compose.yml` / `nginx.conf` a changé : `trivy config .` et `checkov -d backend -d frontend -f docker-compose.yml --quiet`
   Consigner les sorties brutes (résumées) dans le rapport.
3. **Relecture humaine-like** : déléguer au sous-agent `security-reviewer` avec le diff exact et les résultats des scanners, pour la logique métier que les outils ne voient pas (IDOR, autorisation, flux d'entrée non fiable).
4. **Tests** : vérifier qu'un test couvre chaque changement de sécurité ; lancer la suite (`npm test --workspace=backend`, puis `npx tsc --noEmit -p backend` et `npm run type-check --workspace=frontend`). Un changement de sécurité sans test = finding High.
5. **Rapport** (format fixe) :
   - Tableau des findings : Sévérité · Où · Quoi · Correctif · Preuve attendue
   - Résultats des scanners (OK / findings)
   - **Verdict** : Bloquant (≥ 1 Critical/High non traité) ou Mergeable avec réserves
   - Ce qui n'a pas pu être vérifié
6. **Traçabilité** : ajouter une entrée dans `docs/security/ai-log.md` (date, périmètre, verdict, findings acceptés/rejetés par l'humain — à compléter par lui).

## Interdits
Ne pas corriger le code pendant la revue (proposer, puis laisser l'utilisateur décider). Ne pas désactiver de règle ou de scanner pour « faire passer ». Ne pas conclure « aucun problème » sans lister ce qui a été couvert.
