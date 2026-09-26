# Gestion des secrets — GESTION SCHOOL

Aucun secret ne figure ici : **ce fichier décrit où ils vivent, pas ce qu'ils valent.**
Liste de référence des clés : `.env.example` (versionné, valeurs factices).

## Inventaire

| Secret | À quoi il sert | Où il vit (dev) | Où il doit vivre (prod) | Qui y accède | Rotation | Dernière rotation |
|---|---|---|---|---|---|---|
| `DB_PASSWORD` / `DATABASE_URL` | connexion PostgreSQL (Prisma) | `.env` local | gestionnaire de secrets de l'hébergeur | backend | 90 j | à renseigner |
| `JWT_SECRET` | signature des tokens d'accès | `.env` local | gestionnaire de secrets | backend | 90 j (invalide toutes les sessions) | à renseigner |
| `NEXTAUTH_SECRET` | chiffrement des sessions Next.js | `.env` local | gestionnaire de secrets | frontend | 90 j | à renseigner |
| `LDAP_ADMIN_PASSWORD` / `LDAP_PASSWORD` | compte admin OpenLDAP | `.env` local | gestionnaire de secrets | backend, openldap | 90 j | à renseigner |
| `MAIL_USER` / `MAIL_PASS` | SMTP (MailHog en dev, vide) | — | gestionnaire de secrets | backend | 180 j | à renseigner |
| Clés des fournisseurs de paiement (Mobile Money…) | `backend/src/billing/providers/` | — | gestionnaire de secrets | backend | selon fournisseur | à renseigner |
| Certificats TLS (`certs/`) | HTTPS nginx | `certs/` (ignoré par git) | hébergeur / Let's Encrypt | nginx | à l'expiration | à renseigner |
| `ANTHROPIC_API_KEY` | revue de PR par Claude en CI | — | GitHub Actions secrets | workflow `claude-security-review.yml` | 180 j | à renseigner |

## Règles propres au projet

1. **Les valeurs par défaut de `docker-compose.yml`** (`SchoolAdmin123!`, `LdapAdmin123!`,
   `your-secret-key-change-in-production`…) sont **publiques** puisqu'elles sont dans le dépôt :
   elles ne sont acceptables qu'en dev local. Tout déploiement hors poste de dev doit fournir
   chaque variable via l'environnement ; le backend devrait refuser de démarrer si `JWT_SECRET`
   vaut la valeur par défaut hors `NODE_ENV=development` (gap à traiter, voir threat model).
2. **Jamais dans le dépôt** — ni code, ni test, ni fixture, ni seed (`backend/prisma/seed.ts`),
   ni log, ni message de commit, ni capture d'écran. Le kit bloque le commit (Gitleaks) et
   interdit à l'agent la lecture de `.env`, `*.pem`, `*.key`, `certs/`.
3. **`.env.example`** : clés + valeurs factices évidentes, c'est la documentation de ce qu'il
   faut fournir.
4. **Portée minimale** : un secret par usage et par environnement (dev ≠ staging ≠ prod).

## Un secret a fuité — que faire, dans cet ordre

Un secret commité est un secret **compromis**, même si le commit est supprimé une minute plus tard.

1. **Révoquer d'abord** (rotation avant nettoyage de l'historique). Pour `JWT_SECRET` : changer la
   valeur invalide tous les tokens en circulation — c'est l'effet voulu.
2. **Émettre le nouveau secret** et redéployer.
3. **Chercher l'usage abusif** dans les logs entre la date du commit et la révocation — c'est un
   incident : `/incident-report`.
4. **Nettoyer l'historique** si nécessaire (`git filter-repo`), en prévenant l'équipe.
5. **Ajouter la détection** qui aurait évité la fuite et noter la leçon dans `docs/security/ai-log.md`.

## Vérifier

```bash
gitleaks detect --redact --no-banner          # historique complet
gitleaks git --staged --redact --no-banner    # avant un commit (ce que fait le garde-fou)
```
