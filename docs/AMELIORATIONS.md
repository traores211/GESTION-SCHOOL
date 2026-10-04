# School ERP — Points d'amélioration

Audit du dépôt au 3 octobre 2026 (branche `feature/planning-admissions`). Chaque point indique **ce qui a été constaté dans les fichiers**, **pourquoi c'est important** et **quoi faire**. Les priorités vont de P0 (à traiter avant toute mise en production chez un client) à P3 (finition).

Repères chiffrés relevés dans le code :

| Indicateur | Valeur |
|---|---|
| Modules backend | 26, dont **4** avec des tests unitaires (timetable, admissions, assistant, common) |
| Tests frontend | **0** (aucun test, aucune page `error.tsx` ni `not-found.tsx`) |
| Requêtes `findMany` dans les services | 92, dont **20** seulement limitées (`take`) |
| Écritures dans `AuditLog` | **0** (le modèle existe, rien n'y est enregistré) |
| Modèles Prisma avec archivage (`deletedAt`) | **0** sur 41 |
| Intégration continue | **aucune** (pas de dossier `.github/`) |
| Paiements Mobile Money | **simulés** (`SimulatedMobileMoneyProvider`) |

---

## État de mise en œuvre

Mis à jour le 4 octobre 2026, branche `feature/robustness`. « Fait » signifie : codé et vérifié par des tests automatiques. Ce qui dépend d'un compte externe ou d'une démarche légale est indiqué à part, car le code ne peut pas le faire à votre place.

Vérifications en place : 240 tests unitaires côté API, 30 côté web, 27 scénarios de bout en bout sur l'API (594 vérifications). Les 27 tests dans un vrai navigateur datent d'avant les derniers écrans et n'ont pas été relancés : tous les écrans ajoutés depuis (suivi d'admission, cahier de textes, messagerie, inscription, plateforme, et tous ceux de l'évolution multi-écoles) sont vérifiés côté API et à la compilation, pas dans un navigateur.

L'évolution multi-écoles demandée ensuite (`docs/AMELIORATIONS2.md`) a son propre état des lieux : `docs/EVOLUTION-MULTI-ECOLES.md`, et son cahier de recettes : `docs/CAHIER-DE-RECETTES.md`.

Un défaut de sécurité antérieur à ce chantier a été trouvé et corrigé en cours de route : plusieurs listes (classes, personnel, paie) renvoyaient la fiche complète des enseignants, empreinte du mot de passe et secret de double authentification compris. Ces champs ne sortent plus de l'API, et un test le vérifie sur 51 réponses pour quatre rôles.

| N° | Point | État | Ce qui reste |
|---|---|---|---|
| 1 | Images Docker de production | Fait | — |
| 2 | Migrations de base de données | Fait | — |
| 3 | Secrets par défaut | Fait | — |
| 4 | Sauvegardes | Fait | Configurer la copie hors site (`RCLONE_REMOTE`) chez l'hébergeur |
| 5 | Sessions | Fait | — |
| 6 | Authentification (2FA, réinitialisation, politique de mot de passe) | Fait | — |
| 7 | Documentation de l'API fermée en production | Fait | — |
| 8 | Journal d'audit | Fait | — |
| 9 | Intégration continue | Fait | Le workflow n'a pas encore tourné sur GitHub : à confirmer au premier envoi de la branche |
| 10 | Pagination côté serveur | Partiel | Élèves, factures, journal d'audit, messages et vie scolaire sont paginés ; les autres listes sont plafonnées à 2 000 lignes |
| 11 | Tests des calculs critiques | Fait | — |
| 12 | Tests du frontend | Fait | — |
| 13 | Observabilité | Fait | Logs JSON, identifiant de requête, Sentry (optionnel), métriques Prometheus (`/api/metrics`) et règles d'alerte (`deploy/monitoring/alerts.yml`). Reste à brancher un serveur Prometheus chez l'hébergeur |
| 14 | Infrastructure inutilisée | Fait | — |
| 15 | Archivage au lieu de suppression | Fait | — |
| 16 | Numérotations | Fait | — |
| 17 | Cloisonnement entre écoles | Partiel | Vérifié par des tests automatiques (écoles, groupes, périmètre des enseignants) ; pas de cloisonnement au niveau de PostgreSQL (RLS) |
| 18 | Stockage des fichiers | Fait | Le mode S3 est vérifié sur l'exemple de signature publié par AWS, pas encore sur un vrai compartiment |
| 19 | Paiement Mobile Money | Fait côté application | Ouvrir un compte marchand CinetPay et valider en bac à sable (voir ci-dessous) |
| 20 | SMS et WhatsApp | Fait côté application | Souscrire une offre Orange SMS ou Twilio ; WhatsApp demande un expéditeur approuvé |
| 21 | Application installable et appel hors ligne | Fait | Pas d'application mobile native |
| 22 | Bulletins ivoiriens | Fait pour l'essentiel | Format d'export officiel DREN et listes de candidats BEPC/BAC non faits |
| 23 | Imports en masse | Fait | — |
| 24 | Portail parents | Fait | Paiement, bulletins, justificatifs d'absence, emploi du temps, vie scolaire, cahier de textes, messagerie avec l'école, suivi d'admission par numéro de dossier |
| 25 | Modules supplémentaires | Partiel | Fait : vie scolaire (discipline), exports comptables. Fait aussi : cartes à QR code (entrées et sorties), groupes d'établissements. Reste : cantine, bibliothèque, infirmerie, stocks |
| 26 | SaaS en libre-service | Fait | Inscription autonome avec essai de 30 jours, lecture seule à l'échéance, administration de la plateforme, export complet par école. L'activation d'un abonnement est manuelle : l'application n'encaisse pas |
| 27 | Données personnelles (ARTCI) | Fait côté application | Déclaration à l'ARTCI, registre des traitements et documentation de l'hébergement : démarches à faire par l'éditeur et l'établissement |
| 28 | Aides à la décision | Fait | Par règles explicites, sans modèle génératif |
| 29 | Accessibilité | Fait | L'audit automatique passe ; un essai au clavier et au lecteur d'écran par une personne reste recommandé |
| 30 | Performance du frontend | Partiel | Graphiques chargés à la demande ; pas de budget de taille ni de mesure Web Vitals |
| 31 | Interface en anglais | Partiel | Mécanisme de traduction et sélecteur de langue en place ; navigation, titres de pages et connexion traduits. Le contenu des écrans reste en français et se traduit écran par écran |
| 32 | Documentation utilisateur | Partiel | Guide par rôle : `docs/GUIDE-UTILISATEUR.md`. Pas de visites guidées ni de vidéos |
| 33 | Qualité de code | Fait | La machine hôte garde un TypeScript incompatible avec `ts-node` : tout s'exécute dans les conteneurs |

### Ce qui demande une action de votre part

- **CinetPay (point 19)** : renseigner `CINETPAY_API_KEY`, `CINETPAY_SITE_ID` et `CINETPAY_SECRET_KEY`, déclarer l'adresse de notification `…/api/payments/cinetpay/notify`, puis faire un paiement d'essai. La signature des notifications suit la documentation de CinetPay mais n'a pas pu être essayée contre leur service : c'est le premier point à contrôler. Sans ces clés, l'application utilise un paiement simulé, refusé en production.
- **SMS (point 20)** : sans compte opérateur, les messages sont préparés et consignés dans le journal, mais rien n'arrive sur les téléphones.
- **ARTCI (point 27)** : l'application fournit le chiffrement, le consentement, l'export et l'anonymisation ; la déclaration elle-même est une démarche administrative.

### Correction de l'audit initial

Le point 13 indiquait que `/api/health` ne vérifiait pas la base de données. C'était inexact : il la vérifiait déjà. Il renvoie maintenant aussi l'état du cache et la version, avec un code 503 quand la base ne répond pas.

---

## P0 — Bloquants avant une mise en production

### 1. Les images Docker sont des images de développement
- **Constat** : `frontend/Dockerfile` lance `npm install && npm run dev` (serveur de développement Next) ; `backend/docker-entrypoint.sh` lance `npm install`, `prisma db push` puis `nest start --watch`. `docker-compose.yml` monte le code source en volume.
- **Impact** : lenteur (compilation à la demande), consommation mémoire élevée (le moteur Docker a planté pendant cette session), dépendances résolues au démarrage, code modifiable en production.
- **Action** : Dockerfiles multi-étapes (`next build` + `next start` en mode `standalone` ; `nest build` + `node dist/main`), `npm ci`, utilisateur non root, et un `docker-compose.prod.yml` sans volumes de code ni ports de debug.

### 2. Pas de migrations de base de données
- **Constat** : le schéma est appliqué par `prisma db push` à chaque démarrage, et `prisma/migrations/` est exclu par `.gitignore`. Pendant cette session, un changement a exigé `--accept-data-loss`.
- **Impact** : aucune traçabilité des changements de schéma, risque de perte de données en production, impossible de revenir en arrière.
- **Action** : versionner `prisma/migrations`, générer une migration initiale depuis la base actuelle (`prisma migrate diff`), utiliser `prisma migrate deploy` au déploiement, et interdire `db push` hors développement.

### 3. Secrets par défaut dans `docker-compose.yml`
- **Constat** : mots de passe par défaut (`DB_PASSWORD:-SchoolAdmin123!`, `LDAP_PASSWORD:-LdapAdmin123!`) et `JWT_SECRET:-your-secret-key-change-in-production`. `backend/src/auth/jwt-secret.ts` refuse bien un secret faible si `NODE_ENV=production`, mais `NODE_ENV` vaut `development` par défaut.
- **Impact** : une installation faite « par défaut » chez un client est attaquable (jetons forgeables, base accessible avec un mot de passe public).
- **Action** : aucune valeur par défaut pour les secrets en production (le démarrage doit échouer s'ils manquent), `.env.production.example` documenté, rotation des secrets.

### 4. Aucune sauvegarde
- **Constat** : les volumes `postgres_data` et `uploads_data` (qui contient désormais les justificatifs d'admission : actes de naissance, bulletins) n'ont aucune sauvegarde ni procédure de restauration.
- **Impact** : une panne disque fait perdre toute l'année scolaire (notes, paiements, dossiers).
- **Action** : `pg_dump` chiffré quotidien et sauvegarde des fichiers, conservés hors site (30 jours de rétention), plus un test de restauration mensuel automatisé et documenté.

### 5. Session : jeton de 24 h dans le `localStorage`, sans révocation
- **Constat** : `frontend/src/lib/auth.ts` stocke le JWT dans `localStorage` ; `JWT_EXPIRATION` vaut 24 h ; il n'existe ni jeton de rafraîchissement ni déconnexion côté serveur.
- **Impact** : toute faille XSS permet de voler une session valable une journée ; un compte compromis ou un départ de personnel ne peut pas être coupé.
- **Action** : cookie `HttpOnly` + `Secure` + `SameSite`, jeton d'accès court (15 min) et jeton de rafraîchissement à rotation, liste de révocation, et déconnexion de toutes les sessions depuis l'administration.

### 6. Authentification incomplète
- **Constat** : pas de « mot de passe oublié », pas de double authentification. Le limiteur de tentatives (`backend/src/auth/login-rate-limiter.ts`) est en mémoire : il se vide à chaque redémarrage et ne fonctionne pas avec plusieurs instances.
- **Impact** : support saturé par les mots de passe perdus ; comptes de direction et de comptabilité (accès financiers) protégés par un seul facteur.
- **Action** : réinitialisation par e-mail ou SMS avec un jeton à usage unique ; double authentification (TOTP) obligatoire pour la direction et la comptabilité ; limiteur dans Redis (déjà déployé, voir P1) ; politique de mots de passe.

### 7. Documentation de l'API publique
- **Constat** : `backend/src/main.ts` expose Swagger sur `/api/docs` sans condition.
- **Impact** : la carte complète de l'API est offerte à un attaquant.
- **Action** : désactiver Swagger en production, ou le protéger par authentification.

### 8. Journal d'audit jamais alimenté
- **Constat** : le modèle `AuditLog` existe dans `schema.prisma`, mais aucun `auditLog.create` n'existe dans le code. Seuls les emplois du temps (`TimetableChange`) et les admissions (`AdmissionEvent`) ont leur propre historique.
- **Impact** : impossible de savoir qui a modifié une note, annulé une facture ou changé un salaire. C'est un point bloquant pour la comptabilité et en cas de litige avec une famille.
- **Action** : un intercepteur global qui enregistre toute écriture sur les notes, factures, paiements, paie, utilisateurs et inscriptions (auteur, avant/après, adresse IP), plus un écran de consultation pour la direction.

### 9. Pas d'intégration continue
- **Constat** : aucun pipeline. Les tests (114 au backend) ne sont lancés qu'à la main.
- **Impact** : des régressions peuvent arriver sur `main` sans être vues.
- **Action** : GitHub Actions sur chaque PR (lint, `tsc` pour les deux applications, `jest`, scripts de bout en bout `test/e2e-*.js` sur une base Docker éphémère, build des images de production) et branche `main` protégée.

---

## P1 — Fiabilité, performance, maintenabilité

### 10. Listes non paginées côté serveur
- **Constat** : 72 des 92 `findMany` des services n'ont pas de limite. Par exemple, `GET /admissions` renvoie toutes les candidatures ; c'est aussi le cas des élèves, des factures et des paiements.
- **Impact** : temps de réponse et mémoire qui croissent avec l'école (un lycée de 3 000 élèves, plusieurs années d'historique).
- **Action** : pagination par curseur et filtres côté serveur sur toutes les listes ; le frontend (`useTable`) passe en mode serveur au-delà d'un seuil.

### 11. Calculs critiques sans tests
- **Constat** : aucun test pour `billing` (factures, paiements, reste dû), `grades` (moyennes pondérées, rangs ; voir `grades.service.ts`), `payroll`, `attendance`, `bulletins`.
- **Impact** : une erreur de moyenne ou de reste dû touche directement les familles et la crédibilité de l'école.
- **Action** : tests unitaires des calculs (cas limites : absent, note manquante, coefficient nul, égalité de rang) et tests de bout en bout des parcours paiement et bulletin.

### 12. Frontend sans filet
- **Constat** : aucun test frontend ; pas de `app/error.tsx`, `app/global-error.tsx` ni `app/not-found.tsx`.
- **Impact** : une erreur JavaScript affiche une page blanche ; une URL fausse renvoie la page 404 par défaut de Next.
- **Action** : pages d'erreur et de page introuvable dans le style de l'application ; tests Playwright des parcours critiques (connexion, appel, saisie de notes, paiement, admission).

### 13. Observabilité
- **Constat** : logs texte de Nest uniquement ; pas de suivi d'erreurs, de métriques ni d'alertes. Le `/api/health` ne vérifie pas la base.
- **Action** : logs structurés (`pino`) avec un identifiant de requête ; Sentry côté API et côté navigateur ; métriques (temps de réponse, erreurs 5xx) ; contrôle de santé qui teste PostgreSQL ; alertes en cas d'échec de sauvegarde.

### 14. Infrastructure déployée mais inutilisée
- **Constat** : Redis, OpenLDAP et MailHog tournent dans `docker-compose.yml`, mais le code ne les utilise nulle part (aucune référence à `REDIS_URL`, à un client Redis, à `nodemailer` ni à `ldapjs` dans `backend/src`).
- **Impact** : mémoire consommée pour rien sur des serveurs modestes ; fausse impression que l'envoi d'e-mails ou le LDAP fonctionnent.
- **Action** : utiliser Redis (limiteur de connexion, cache du tableau de bord, files de tâches BullMQ pour les envois SMS et e-mail, exports lourds) et brancher l'envoi d'e-mails ; retirer LDAP tant qu'aucun client ne le demande.

### 15. Suppressions définitives
- **Constat** : aucun des 41 modèles n'a de champ d'archivage. Supprimer un élève supprime en cascade ses inscriptions, notes, factures et paiements (`onDelete: Cascade`).
- **Impact** : perte d'historique comptable et scolaire. En comptabilité, une pièce ne doit pas disparaître.
- **Action** : archivage (`archivedAt`) pour les élèves, le personnel, les factures et les paiements ; annulation par avoir plutôt que suppression ; corbeille restaurable.

### 16. Numérotations fragiles
- **Constat** : les numéros sont calculés à partir d'un `count` : références de factures `INV-…` (`billing.service.ts:35`) et matricules des élèves (`students.service.ts:14`).
- **Impact** : doublons possibles quand deux secrétaires saisissent en même temps.
- **Action** : séquences PostgreSQL, ou une table de compteurs verrouillée en transaction ; contrainte unique avec nouvelle tentative (déjà fait pour les références d'admission).

### 17. Cloisonnement entre écoles fait à la main
- **Constat** : chaque service filtre lui-même par `schoolId` (`requireSchool`, `findOwned`…).
- **Impact** : un seul oubli fait fuir les données d'une école vers une autre. C'est le risque n°1 d'un SaaS multi-écoles.
- **Action** : extension Prisma qui injecte `schoolId` automatiquement, ou Row-Level Security PostgreSQL ; tests systématiques « un utilisateur de l'école A ne voit rien de l'école B » sur toutes les routes.

### 18. Stockage des fichiers
- **Constat** : images et justificatifs sont stockés sur un volume local (`UPLOAD_DIR`).
- **Action** : stockage objet compatible S3 (MinIO en local), URL signées à durée limitée, analyse antivirus (ClamAV) des documents déposés par les familles, quotas par école.

---

## P2 — Ce qui rendra l'application incontournable sur le marché

Positionnement visé : le marché ivoirien et ouest-africain, face à EduKo, Logesco, SchoolExpert, GEP-CI et Eduka.

### 19. Paiement Mobile Money réel (priorité commerciale n°1)
- **Constat** : `backend/src/billing/providers/payment-providers.registry.ts` simule Orange Money, MTN, Moov et Wave (`SimulatedMobileMoneyProvider` renvoie toujours `SUCCESS`).
- **Action** : brancher un agrégateur (CinetPay, PayDunya, FedaPay) ou l'API Wave, avec webhooks signés, rapprochement automatique, reçus PDF et SMS de confirmation. Les parents doivent pouvoir payer depuis leur téléphone à partir d'un lien reçu par SMS.

### 20. Notifications SMS et WhatsApp aux familles
- **Constat** : notifications internes uniquement, appelées depuis seulement 2 endroits du code.
- **Action** : passerelle SMS (Orange SMS API, Twilio) et WhatsApp Business pour les absences du jour, les notes et bulletins publiés, les impayés et relances, et les convocations d'admission (test, entretien). Gestion du coût (quota par école, regroupement en résumé quotidien).

### 21. Application mobile ou PWA hors ligne
- **Constat** : pas de manifeste, aucun fonctionnement hors ligne.
- **Action** : PWA installable avec service worker. L'appel et la saisie des notes doivent fonctionner hors connexion puis se synchroniser (connexions instables dans beaucoup d'établissements) ; application parents légère.

### 22. Bulletins et examens conformes au système ivoirien
- **Constat** : moyennes pondérées et rang calculés (`grades.service.ts`), mais rien sur les appréciations, la moyenne annuelle, le conseil de classe, les décisions de passage ou les examens.
- **Action** :
  - appréciations par matière et générale, mentions, tableaux d'honneur ;
  - moyennes annuelles, conseil de classe et décisions (passage, redoublement, exclusion) ;
  - exports au format attendu par la DREN et le MENA, livret scolaire ;
  - gestion des candidats au BEPC et au BAC.

### 23. Import de données en masse pour l'arrivée d'une école
- **Constat** : `students.controller.ts` et `staff.controller.ts` n'offrent qu'une création unitaire ; seul l'emploi du temps a un import.
- **Action** : imports Excel (modèle téléchargeable, rapport ligne par ligne, confirmation explicite, comme pour la planification) pour les élèves, les parents, le personnel, les notes et les soldes de scolarité. Sans cela, l'arrivée d'une école prend des semaines au lieu d'une journée.

### 24. Portail parents enrichi
- **Constat** : `parent-portal.controller.ts` n'offre que deux routes (liste et détail des enfants).
- **Action** : paiement en ligne, justification d'absence, messagerie avec l'école, emploi du temps, cahier de textes et devoirs, bulletins téléchargeables, suivi du dossier d'admission par référence `ADM-…`.

### 25. Modules attendus par les directions
Fonctionnalités courantes chez les concurrents ou demandées par les directeurs :
- discipline et sanctions ;
- cantine ;
- bibliothèque ;
- infirmerie ;
- cartes scolaires avec QR code et pointage par badge ;
- stocks et fournitures ;
- comptabilité complète (journal, grand livre, export Sage ou Excel) ;
- consolidation pour les groupes scolaires (plusieurs établissements, indicateurs agrégés).

### 26. SaaS en libre-service
- **Action** : création d'un établissement en autonomie avec essai gratuit, abonnements et facturation de la plateforme, sous-domaine ou domaine personnalisé pour la vitrine, sauvegarde et export des données par école (réversibilité, argument de confiance).

### 27. Conformité ARTCI (loi n° 2013-450 sur les données personnelles)
- **Action** :
  - déclaration auprès de l'ARTCI ;
  - consentement des parents (formulaire d'admission en ligne) ;
  - registre des traitements ;
  - droits d'accès, de rectification et de suppression ;
  - chiffrement des données sensibles (santé, justificatifs) ;
  - durées de conservation ;
  - hébergement documenté.

  C'est un argument de vente auprès des établissements privés et confessionnels.

### 28. Intelligence artificielle utile
- **Constat** : l'assistant Dify (chatbot et agent) est intégré, ainsi qu'un import d'emploi du temps assisté par IA (optionnel).
- **Action** :
  - alertes de risque de décrochage (absences, chute des notes) ;
  - prévision des impayés ;
  - propositions d'appréciations de bulletin ;
  - résumé hebdomadaire envoyé au directeur.

---

## P3 — Finition

29. **Accessibilité** : audit WCAG 2.2 AA (contrastes en thème sombre, navigation au clavier dans les grilles, libellés ARIA), tests automatiques axe.
30. **Performance du frontend** : chargement différé des graphiques Recharts, mesures Web Vitals, budget de taille par page.
31. **Bilinguisme** : interface anglaise pour les établissements internationaux ou bilingues (`next-intl`).
32. **Documentation** : guide utilisateur par rôle, visites guidées dans l'application, centre d'aide, vidéos courtes.
33. **Qualité de code** : ESLint et Prettier vérifiés en CI, dépendances à jour (Dependabot), versions de Node et TypeScript identiques entre la machine hôte et les conteneurs (la machine hôte a TypeScript 7 incompatible avec `ts-node`).

---

## Feuille de route proposée

| Période | Objectif | Points |
|---|---|---|
| **0–30 jours** | Installable chez un premier client sans risque | 1, 2, 3, 4, 7, 9, 12, 13 |
| **30–60 jours** | Sécurité et confiance | 5, 6, 8, 10, 11, 15, 16, 17 |
| **60–90 jours** | Différenciation commerciale | 19, 20, 23, 21 (appel hors ligne d'abord) |
| **90–180 jours** | Couverture fonctionnelle complète | 22, 24, 25, 26, 27, 18, 14 |
| En continu | Finition | 28 à 33 |

Les deux leviers les plus forts face à la concurrence sont le **paiement Mobile Money réel avec relances par SMS** (19 et 20) et un **import de données en une journée** (23). Ils transforment l'outil de gestion en outil qui rapporte de l'argent à l'école et qui s'installe vite.
