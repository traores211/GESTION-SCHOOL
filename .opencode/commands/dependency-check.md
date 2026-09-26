---
# Fichier GÉNÉRÉ par scripts/sync-opencode.sh — ne pas éditer à la main.
# Source de vérité : .claude/skills/dependency-check/SKILL.md
description: Vérifier les dépendances du projet — existence réelle sur le registre (anti-hallucination / slopsquatting), réputation, vulnérabilités connues (SCA), épinglage des versions, SBOM.
agent: build
---

Applique la procédure du skill `dependency-check` à ce dépôt.

Charge d'abord sa définition complète avec l'outil skill — `skill({ name: "dependency-check" })` —
puis suis ses étapes dans l'ordre, sans en sauter et sans en inventer. Respecte ses
interdits, et termine par la commande qui prouve le résultat.

Périmètre demandé : $ARGUMENTS
(si vide, prends le périmètre par défaut décrit dans le skill)
