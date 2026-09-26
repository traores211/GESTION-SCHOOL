---
name: threat-model
description: Produire ou mettre à jour le threat model STRIDE du projet (docs/security/threat-model.md) à partir de l'architecture réelle, puis en dériver des actions priorisées. À utiliser avant une mise en production, après un changement d'architecture, ou quand l'utilisateur demande "quelles sont les menaces", "STRIDE", "modélise les risques".
allowed-tools: Read, Grep, Glob, Write, Agent
---

# /threat-model — Modéliser les menaces

## Étapes
1. **Inventaire des sources** : lister les fichiers d'architecture présents (`docker-compose.yml`, `nginx.conf`, Dockerfiles, workflows CI, `backend/prisma/schema.prisma`, contrôleurs NestJS, `backend/src/auth/`, guards de rôles, client API du frontend). Signaler ce qui manque plutôt que l'inventer.
2. **Déléguer** au sous-agent `threat-modeler` avec cette liste : il produit le DFD, le tableau STRIDE avec contrôles existants cités (fichier) et gaps, et écrit `docs/security/threat-model.md`.
3. **Contre-relecture** (obligatoire, c'est la validation humaine assistée) : relire le tableau produit et vérifier au moins
   - qu'aucun « gap » ne correspond à un contrôle déjà présent dans le code (chercher dans le repo),
   - qu'aucune menace n'est hors sujet pour cette architecture,
   - que chaque gap a une mitigation et une preuve.
   Corriger le fichier si nécessaire et noter les corrections apportées à l'analyse.
4. **Plan d'action** : les 3 à 5 gaps prioritaires sous forme d'issues (titre, risque, mitigation, preuve, effort), à proposer à l'utilisateur — ne pas les implémenter dans ce workflow.
5. **Traçabilité** : entrée dans `docs/security/ai-log.md` (ce que l'analyse IA a bien vu, ce qu'il a fallu corriger).

## Rappels
Un threat model est vivant : dater le document et lister les hypothèses. Le refaire à chaque nouvelle frontière de confiance (nouveau service, nouvelle intégration, exposition publique).
