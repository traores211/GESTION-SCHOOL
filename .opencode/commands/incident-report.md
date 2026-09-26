---
# Fichier GÉNÉRÉ par scripts/sync-opencode.sh — ne pas éditer à la main.
# Source de vérité : .claude/skills/incident-report/SKILL.md
description: Analyser un incident de sécurité (logs, alertes, symptômes) et produire un rapport structuré selon le cycle Identification → Containment → Eradication → Recovery → Lessons Learned, avec preuves citées et actions de prévention.
agent: build
---

Applique la procédure du skill `incident-report` à ce dépôt.

Charge d'abord sa définition complète avec l'outil skill — `skill({ name: "incident-report" })` —
puis suis ses étapes dans l'ordre, sans en sauter et sans en inventer. Respecte ses
interdits, et termine par la commande qui prouve le résultat.

Périmètre demandé : $ARGUMENTS
(si vide, prends le périmètre par défaut décrit dans le skill)
