---
# Fichier GÉNÉRÉ par scripts/sync-opencode.sh — ne pas éditer à la main.
# Source de vérité : .claude/skills/harden-dockerfile/SKILL.md
description: Durcir un Dockerfile selon les 4 principes (minimal, non-root, pinned, scanned), avec preuve Trivy avant/après et vérification que l'application tourne toujours.
agent: build
---

Applique la procédure du skill `harden-dockerfile` à ce dépôt.

Charge d'abord sa définition complète avec l'outil skill — `skill({ name: "harden-dockerfile" })` —
puis suis ses étapes dans l'ordre, sans en sauter et sans en inventer. Respecte ses
interdits, et termine par la commande qui prouve le résultat.

Périmètre demandé : $ARGUMENTS
(si vide, prends le périmètre par défaut décrit dans le skill)
