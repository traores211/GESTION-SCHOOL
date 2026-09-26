---
# Fichier GÉNÉRÉ par scripts/sync-opencode.sh — ne pas éditer à la main.
# Source de vérité : .claude/skills/threat-model/SKILL.md
description: Produire ou mettre à jour le threat model STRIDE du projet (docs/security/threat-model.
agent: build
---

Applique la procédure du skill `threat-model` à ce dépôt.

Charge d'abord sa définition complète avec l'outil skill — `skill({ name: "threat-model" })` —
puis suis ses étapes dans l'ordre, sans en sauter et sans en inventer. Respecte ses
interdits, et termine par la commande qui prouve le résultat.

Périmètre demandé : $ARGUMENTS
(si vide, prends le périmètre par défaut décrit dans le skill)
