---
# Fichier GÉNÉRÉ par scripts/sync-opencode.sh — ne pas éditer à la main.
# Source de vérité : .claude/skills/security-review/SKILL.md
description: Revue de sécurité complète des changements en cours (diff vs main) avant d'ouvrir une PR — scanners + relecture OWASP par le sous-agent security-reviewer + vérification des tests.
agent: build
---

Applique la procédure du skill `security-review` à ce dépôt.

Charge d'abord sa définition complète avec l'outil skill — `skill({ name: "security-review" })` —
puis suis ses étapes dans l'ordre, sans en sauter et sans en inventer. Respecte ses
interdits, et termine par la commande qui prouve le résultat.

Périmètre demandé : $ARGUMENTS
(si vide, prends le périmètre par défaut décrit dans le skill)
