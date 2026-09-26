---
name: incident-report
description: Analyser un incident de sécurité (logs, alertes, symptômes) et produire un rapport structuré selon le cycle Identification → Containment → Eradication → Recovery → Lessons Learned, avec preuves citées et actions de prévention. À utiliser quand l'utilisateur signale une attaque, des logs suspects, une fuite, ou demande un post-mortem.
allowed-tools: Read, Grep, Glob, Bash, Write, Agent
---

# /incident-report — Répondre méthodiquement

## Étapes
1. **Collecte** : localiser les sources (fichiers de logs, `docker compose logs`, alertes, tickets). Demander l'intervalle de temps si inconnu. **Ne rien supprimer ni écraser** : les logs sont des preuves — les copier dans `docs/security/evidence/<date>/` si nécessaire.
2. **Déléguer** l'analyse au sous-agent `incident-analyst` : chronologie UTC, IoC, vecteur, périmètre, cause racine, chaque affirmation citée.
3. **Contre-vérifier** (validation humaine assistée, obligatoire) au minimum :
   - l'IP désignée est bien celle du client réel (`X-Forwarded-For`) et non celle du reverse proxy,
   - la séquence d'attaque est cohérente (échecs → succès → accès anormaux),
   - le vecteur correspond à une faille réelle du code (ouvrir le fichier/route concernée).
   Noter ce que l'analyse a bien vu et ce qu'il a fallu corriger.
4. **Containment immédiat** à proposer à l'utilisateur (bloquer l'IP, révoquer tokens/sessions, isoler) — attendre son accord avant toute action à effet de bord.
5. **Eradication** : correctif de la cause racine + test de non-régression ; ouvrir la PR via l'agent principal, avec le rapport en description.
6. **Rapport** : `docs/security/incident-<YYYY-MM-DD>.md` complet (Summary · Timeline · IoC · Vector · Scope · Containment · Eradication · Recovery · Root cause · Lessons & actions avec owner/échéance · Evidence).
7. **Prévention** : transformer chaque leçon en contrôle automatique (test en CI, règle de détection, gate) — c'est la partie *Preparation* du prochain incident.

## Interdits
Pas de blâme nominatif dans le rapport. Pas d'affirmation sans preuve citée. Pas de destruction de preuves.
