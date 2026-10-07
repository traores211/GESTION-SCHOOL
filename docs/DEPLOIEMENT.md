# Déploiement en production

Ce guide installe School ERP sur un serveur Linux (Ubuntu 22.04+ recommandé, 2 vCPU, 4 Go de RAM, 40 Go de disque) avec Docker. Le développement local continue d'utiliser `docker-compose.yml`. La production utilise `docker-compose.prod.yml`.

## 1. Préparer le serveur

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/traores211/GESTION-SCHOOL.git school-erp && cd school-erp
cp deploy/.env.production.example .env.production
```

Remplissez **toutes** les valeurs de `.env.production` :

```bash
openssl rand -base64 48   # JWT_SECRET, DB_PASSWORD, REDIS_PASSWORD, BACKUP_PASSPHRASE
openssl rand -base64 32   # DATA_ENCRYPTION_KEY (exactement 32 octets)
```

- **Refus au démarrage** : l'API ne démarre pas si un secret manque, s'il est trop court ou s'il garde une valeur d'exemple (`src/infra/env.ts`). Docker Compose refuse aussi de démarrer si une variable obligatoire est vide.
- **Copies à conserver hors du serveur** (gestionnaire de mots de passe) : `BACKUP_PASSPHRASE` et `DATA_ENCRYPTION_KEY`. Sans elles, les sauvegardes et les données chiffrées sont illisibles.

## 2. Certificats HTTPS

### 2.1 Certificat par défaut

Nginx utilise `deploy/certs/fullchain.pem` et `deploy/certs/privkey.pem` comme certificat de secours (hôte inconnu, nouveau domaine en attente). Vous pouvez démarrer avec un certificat auto-signé pour la première mise en route :

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deploy/certs/privkey.pem -out deploy/certs/fullchain.pem \
  -subj "/CN=mon-saas-ecole.ci"
```

Remplacez-le dès que possible par un certificat Let's Encrypt pour le domaine principal de la plateforme :

```bash
docker run --rm -p 80:80 -v "$PWD/deploy/certs:/etc/letsencrypt" certbot/certbot \
  certonly --standalone -d mon-saas-ecole.ci --agree-tos -m admin@example.ci
cp deploy/certs/live/mon-saas-ecole.ci/fullchain.pem deploy/certs/live/mon-saas-ecole.ci/privkey.pem deploy/certs/
```

### 2.2 Certificats automatiques des domaines d'école

Chaque établissement peut utiliser son propre domaine (ex. `mon-ecole-1.ci`) : la plateforme stocke le mapping dans `SchoolDomain` et nginx accepte n'importe quel hôte. Les certificats Let's Encrypt sont obtenus par le service `certbot` dédié.

**Prérequis** :

1. Le domaine pointe (A/AAAA) vers l'IP du serveur.
2. L'école a terminé la vérification DNS TXT dans l'écran « Domaines » (statut `ACTIVE`).
3. Les variables `CERTBOT_TOKEN` et `CERTBOT_EMAIL` sont renseignées dans `.env.production`.

**Première émission (manuelle)** :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile certbot run --rm certbot renew-now
```

Le script :

- appelle `GET /api/platform/certbot/hostnames` (bearer `CERTBOT_TOKEN`) pour obtenir la liste des domaines `ACTIVE` ;
- lance `certbot certonly --webroot` pour chaque hôte ;
- écrit un fichier `deploy/nginx/sites/<host>.conf` (via volume partagé) ;
- demande à nginx de recharger sa configuration.

**Renouvellement automatique** — ajouter une tâche cron sur l'hôte :

```cron
0 2 * * *  cd /opt/school-erp && docker compose -f docker-compose.prod.yml --env-file .env.production --profile certbot run --rm certbot renew-now >> /var/log/school-certbot.log 2>&1
```

Ou lancer le service en mode permanent :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile certbot up -d certbot
# Puis le container boucle (renew-cron) et renouvelle chaque nuit à 02h00.
```

**Test contre le serveur de staging** (sans toucher au quota de prod) : `CERTBOT_STAGING=true` dans l'env.

## 3. Démarrer

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps
curl -s https://ecole.example.ci/api/health      # {"status":"ok","database":"up","cache":"up",…}
```

Au démarrage, l'API applique les migrations en attente (`scripts/migrate.sh`). Aucune donnée de démonstration n'est créée en production.

**Premier administrateur** : créez-le depuis le serveur, puis activez la double authentification depuis « Sécurité du compte ».

```bash
docker compose -f docker-compose.prod.yml exec backend node -e "
const {PrismaClient}=require('@prisma/client');const b=require('bcrypt');const p=new PrismaClient();
(async()=>{const o=await p.organisation.create({data:{name:'Mon groupe',slug:'mon-groupe',email:'contact@example.ci'}});
const s=await p.school.create({data:{organisationId:o.id,name:'Mon école',code:'ECOLE-01',email:'contact@example.ci'}});
await p.user.create({data:{email:'directeur@example.ci',password:await b.hash(process.argv[1],12),firstName:'Prénom',lastName:'NOM',role:'DIRECTOR',schoolId:s.id}});
console.log('ok');process.exit(0)})()" 'Un-Mot-De-Passe-Solide-2026'
```

## 4. Mettre à jour

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Les migrations sont appliquées automatiquement. En cas de problème, revenez à la version précédente (`git checkout <tag>`) et restaurez la dernière sauvegarde (voir le § 6).

## 5. Migrations de base de données (développeurs)

- **Versionnement** : le schéma est décrit par `backend/prisma/schema.prisma` et les changements par des migrations versionnées dans `backend/prisma/migrations/`.
- **Après une modification de `schema.prisma`, en local** :

  ```bash
  docker compose exec backend npx prisma migrate dev --name description_courte
  ```

- **À commiter** : le dossier de migration créé, avec le schéma.
- **Vérification en CI** : chaque PR vérifie que les migrations reconstruisent exactement le schéma.
- **Bases créées avant les migrations** (avec `prisma db push`) : elles sont prises en charge automatiquement. La migration `0_init` y est marquée comme déjà appliquée.
- **À ne pas faire** : `prisma db push` en production.

## 6. Sauvegardes et restauration

Le service `backup` fait chaque nuit à 02:30 (heure d'Abidjan) :

- une copie de la base (`pg_dump`) et des fichiers déposés (justificatifs, images), chiffrées en AES-256 avec `BACKUP_PASSPHRASE` ;
- une somme de contrôle par fichier ;
- une rotation sur `BACKUP_RETENTION_DAYS` jours (30 par défaut) ;
- une copie hors site si `RCLONE_REMOTE` est défini : S3, Backblaze, Google Drive… Configurez `deploy/rclone/rclone.conf` avec `rclone config`.

Le 1er de chaque mois, `verify.sh` **restaure la dernière sauvegarde dans une base temporaire** et vérifie son contenu. Les dates du dernier succès sont dans `/backups/last-success` et `/backups/last-verify`.

```bash
# Sauvegarde immédiate
docker compose -f docker-compose.prod.yml exec backup backup.sh
# Test de restauration immédiat
docker compose -f docker-compose.prod.yml exec backup verify.sh
# Restauration complète (arrêtez d'abord l'API)
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml exec backup restore.sh latest --files
docker compose -f docker-compose.prod.yml start backend
```

## 7. Sécurité en place

- **Connexion** :
  - jeton d'accès de 15 minutes ;
  - session renouvelée par un cookie `HttpOnly` à rotation, avec détection de réutilisation ;
  - blocage après 10 échecs par compte ou 50 par adresse IP ;
  - double authentification (TOTP) recommandée pour la direction et la comptabilité ;
  - « mot de passe oublié » par e-mail, avec un lien à usage unique d'une heure.
- **Comptes** : un compte désactivé, un mot de passe changé ou « tout déconnecter » coupent immédiatement les sessions.
- **Journal d'audit** : toute modification est enregistrée (auteur, avant/après, adresse IP), ainsi que les connexions réussies ou non. Il est consultable par la direction dans « Journal d'audit ».
- **Exposition** :
  - en-têtes de sécurité (helmet, HSTS) et limitation de débit par nginx ;
  - Swagger désactivé (`SWAGGER_ENABLED=false`).
- **Données sensibles** : chiffrées avec `DATA_ENCRYPTION_KEY`.

## 8. Surveillance

- **`GET /api/health`** : renvoie 200 si la base répond, 503 sinon. Branchez-le sur un service de surveillance (UptimeRobot, Better Stack…).
- **Erreurs** : renseignez `SENTRY_DSN` pour recevoir les erreurs de l'API.
- **Journaux** : `docker compose -f docker-compose.prod.yml logs -f backend`. Ils sont au format JSON en production, avec un identifiant de requête.
