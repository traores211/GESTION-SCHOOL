---
name: dependency-check
description: Vérifier les dépendances du projet — existence réelle sur le registre (anti-hallucination / slopsquatting), réputation, vulnérabilités connues (SCA), épinglage des versions, SBOM. À utiliser avant d'ajouter une dépendance, quand une dépendance est suggérée (par l'IA ou un humain), ou pour un audit périodique des composants tiers.
allowed-tools: Read, Grep, Glob, Bash, Write
---

# /dependency-check — Vérifier ce qu'on embarque

## A. Avant d'ajouter UNE dépendance (mode ciblé)
Pour chaque package proposé :
1. **Existence** : `npm view <pkg> version time.modified repository.url` (ou la page npmjs.com). Introuvable → **stop** : probable hallucination, proposer une alternative établie.
2. **Réputation** : dépôt source lié, dernière publication, nombre de mainteneurs, téléchargements, typosquatting possible (nom proche d'un package connu ?).
3. **Vulnérabilités** : `npm audit` après installation dans une branche, ou la page GitHub Advisory du package ; licence compatible.
4. **Épinglage** : proposer la version exacte à écrire dans `backend/package.json` ou `frontend/package.json` (+ `package-lock.json` racine, installée via `npm install <pkg>@<version> --workspace=<backend|frontend>`).
5. Conclure : *Acceptable* / *À éviter* + justification en une ligne, à copier dans la PR.

## B. Audit périodique du projet (mode complet)
1. **Inventaire** : arbre des dépendances directes et transitives (`npm ls --all --workspaces`).
2. **SBOM** : `syft dir:. -o spdx-json > sbom.json` (ou sur l'image : `syft <image>`), à archiver comme artefact de build.
3. **SCA** : `npm audit --audit-level=high` (racine : couvre les deux workspaces) ; `trivy fs .` pour une vue croisée.
4. **Triage** (ne pas se fier au seul score CVSS) : pour chaque finding HIGH/CRITICAL, répondre à *exploitable dans notre usage ? composant exposé ? correctif disponible ?* et classer : corriger maintenant / planifier / accepter (justifié).
5. **Épinglage & hygiène** : versions flottantes, packages inutilisés, doublons.
6. **Rapport** dans `docs/security/dependencies-<date>.md` + rappel des gates CI (`npm audit` bloquant, Trivy image, Dependabot activé).

## Interdits
Ne jamais exécuter `npm install` d'un package dont l'existence n'a pas été vérifiée. Ne pas résoudre une alerte en la masquant (`overrides` de complaisance, `audit-level` relevé) sans justification écrite et datée.
