# PROMPT MAÎTRE CLAUDE CODE
## Évolution d'une application de gestion scolaire existante vers un SaaS multi-tenant professionnel

---

# 1. TON RÔLE

Tu es un architecte logiciel senior, développeur full-stack senior, expert SaaS, sécurité applicative, multi-tenancy, DevSecOps, UX/UI et systèmes de gestion scolaire.

Tu dois faire évoluer une application de gestion d'établissements scolaires EXISTANTE vers une véritable plateforme SaaS professionnelle.

L'application existe déjà.

## RÈGLE ABSOLUE DE NON-RÉGRESSION

NE PAS repartir de zéro.

NE PAS réécrire inutilement l'application.

NE PAS supprimer une fonctionnalité existante simplement parce qu'une nouvelle architecture est envisagée.

NE PAS modifier brutalement la base de données.

NE PAS remplacer massivement des composants fonctionnels sans nécessité.

Avant toute modification, tu dois comprendre l'existant.

---

# 2. PREMIÈRE ÉTAPE OBLIGATOIRE : AUDIT COMPLET

Avant d'écrire ou modifier du code, inspecte le projet.

Analyse notamment :

- architecture ;
- frontend ;
- backend ;
- API ;
- base de données ;
- ORM ;
- migrations ;
- authentification ;
- autorisation ;
- rôles ;
- permissions ;
- routes ;
- pages ;
- composants ;
- services ;
- stockage des fichiers ;
- système de notifications ;
- Docker ;
- Docker Compose ;
- variables d'environnement ;
- CI/CD ;
- tests ;
- documentation ;
- configuration réseau ;
- configuration des domaines ;
- reverse proxy éventuel.

Tu dois également rechercher :

- TODO ;
- FIXME ;
- fonctionnalités incomplètes ;
- duplication de code ;
- failles évidentes ;
- problèmes d'architecture ;
- dépendances obsolètes ;
- routes non protégées ;
- accès directs aux données ;
- problèmes de séparation des tenants.

---

# 3. ADMINER — OBLIGATION POUR L'INSPECTION DE LA BASE

Le projet utilise une base de données.

Tu dois utiliser **Adminer**, lorsqu'il est disponible dans l'environnement, pour faciliter l'inspection et la compréhension des données existantes.

Adminer doit être considéré comme un OUTIL D'ADMINISTRATION / INSPECTION de la base, et non comme une interface métier destinée aux utilisateurs.

Exemple d'architecture de développement :

```text
Application
    │
    ▼
Database
    ▲
    │
 Adminer
```

Vérifie :

- moteur de base ;
- tables ;
- colonnes ;
- clés primaires ;
- clés étrangères ;
- index ;
- contraintes ;
- données existantes ;
- relations ;
- éventuelles tables de sécurité ;
- éventuelles tables tenant/school déjà présentes.

## IMPORTANT

Ne jamais modifier ou supprimer des données de production simplement pour effectuer une inspection.

Avant toute modification du schéma :

1. analyser ;
2. documenter ;
3. préparer migration ;
4. tester ;
5. vérifier compatibilité ;
6. prévoir rollback si nécessaire.

---

# 4. RAPPORT INITIAL OBLIGATOIRE

Avant toute implémentation, produis un rapport comprenant :

```text
A. Architecture actuelle
B. Stack technique
C. Base de données
D. Fonctionnalités existantes
E. Utilisateurs et rôles
F. Authentification
G. Autorisation
H. Structure des données
I. Fonctionnalités manquantes
J. Risques de régression
K. Risques de sécurité
L. Architecture SaaS proposée
M. Plan de migration
N. Plan de tests
O. Roadmap
```

NE MODIFIE PAS LE CODE avant d'avoir terminé cette analyse.

---

# 5. OBJECTIF FINAL

Transformer l'application en :

> Plateforme SaaS multi-tenant de gestion d'établissements scolaires, sécurisée, scalable, personnalisable et adaptée en priorité au système éducatif ivoirien.

Architecture cible :

```text
                    PLATEFORME SaaS
                 mon-saas-ecole.ci
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
     ÉCOLE 1          ÉCOLE 2          ÉCOLE 3
        │                │                │
        ▼                ▼                ▼
 mon-ecole-1.ci    mon-ecole-2.ci    mon-ecole-3.ci
```

---

# 6. DOMAINE PRINCIPAL DU SaaS

Le domaine de la plateforme est :

```text
mon-saas-ecole.ci
```

Il représente :

- la plateforme ;
- la présentation du SaaS ;
- les offres ;
- les abonnements ;
- l'inscription des établissements ;
- la connexion plateforme ;
- l'administration générale ;
- les ressources éducatives communes ;
- la documentation ;
- la présentation du produit.

Il ne doit pas être confondu avec une école.

---

# 7. DOMAINES PERSONNALISÉS DES ÉCOLES

Chaque école doit pouvoir disposer de son propre domaine.

Exemple :

```text
École 1
mon-ecole-1.ci

École 2
mon-ecole-2.ci

École 3
mon-ecole-3.ci
```

Le système doit être conçu pour permettre :

```text
école.mon-saas-ecole.ci
```

comme solution de secours ou de démonstration.

Mais l'objectif commercial principal doit permettre :

```text
mon-ecole-1.ci
mon-ecole-2.ci
mon-ecole-3.ci
```

---

# 8. VÉRIFICATION TECHNIQUE DES DOMAINES PERSONNALISÉS

Avant d'implémenter cette fonctionnalité, analyse l'infrastructure actuelle et détermine la meilleure solution.

Étudier notamment :

- DNS ;
- CNAME ;
- A/AAAA ;
- reverse proxy ;
- Nginx ;
- Traefik ;
- Cloudflare ;
- certificats TLS ;
- Let's Encrypt ;
- SNI ;
- routage par Host header ;
- renouvellement automatique des certificats.

L'architecture doit pouvoir faire :

```text
HTTP Request
      │
      ▼
Hostname
      │
      ▼
Tenant Resolver
      │
      ▼
School
      │
      ▼
Tenant Context
      │
      ▼
Application
```

Exemple :

```text
Host: mon-ecole-1.ci
       ↓
school_domains
       ↓
school_id = 001
       ↓
tenant_id = 001
       ↓
École 1
```

---

# 9. TABLE DE DOMAINES

Prévoir une structure permettant de gérer plusieurs domaines par école.

Exemple conceptuel :

```text
school_domains

id
school_id
domain
domain_type
is_primary
status
verification_token
verified_at
ssl_status
created_at
updated_at
```

Types possibles :

```text
PLATFORM
SUBDOMAIN
CUSTOM_DOMAIN
CUSTOM_DOMAIN_ALIAS
```

Statuts :

```text
PENDING
VERIFYING
ACTIVE
SUSPENDED
FAILED
REMOVED
```

Une école peut avoir :

```text
mon-ecole-1.ci
www.mon-ecole-1.ci
ecole1.mon-saas-ecole.ci
```

mais un seul domaine principal.

---

# 10. SÉCURITÉ DES DOMAINES

Attention aux attaques de type domain takeover.

Avant d'activer un domaine personnalisé :

1. vérifier sa propriété ;
2. vérifier DNS ;
3. vérifier le challenge ;
4. vérifier le certificat ;
5. associer le domaine au bon tenant ;
6. empêcher qu'un autre tenant revendique le même domaine.

Ne jamais considérer simplement le HTTP Host header comme une preuve d'identité du tenant.

Le Host doit être résolu par rapport à une table de domaines vérifiés.

---

# 11. HTTPS

Tous les domaines doivent utiliser HTTPS en production.

Exemple :

```text
https://mon-saas-ecole.ci
https://mon-ecole-1.ci
https://mon-ecole-2.ci
https://mon-ecole-3.ci
```

Étudier une architecture permettant la gestion automatique des certificats.

Une solution de type Cloudflare for SaaS peut être envisagée pour les domaines personnalisés et la gestion SSL à grande échelle.

NE PAS intégrer une solution externe sans analyser son coût, ses contraintes et son adéquation à l'infrastructure actuelle.

---

# 12. MULTI-TENANCY

Une école = un tenant.

Toutes les données métier d'une école doivent être isolées.

Architecture :

```text
PLATFORM
   │
   ├── TENANT A
   │     ├── Users
   │     ├── Students
   │     ├── Teachers
   │     ├── Classes
   │     ├── Grades
   │     └── Documents
   │
   ├── TENANT B
   │     └── ...
   │
   └── TENANT C
         └── ...
```

Chaque requête doit avoir un contexte :

```text
tenant_id
school_id
user_id
role
permissions
```

---

# 13. ISOLATION ABSOLUE

Il doit être impossible pour :

```text
École A
```

d'accéder aux données de :

```text
École B
```

même en essayant :

- changement d'ID ;
- modification URL ;
- appel API manuel ;
- modification du payload ;
- manipulation des paramètres ;
- accès direct à un document ;
- export ;
- recherche ;
- statistiques ;
- endpoint non documenté.

Tester explicitement les attaques IDOR/BOLA.

---

# 14. ADMINISTRATION GÉNÉRALE

L'administrateur général appartient à la plateforme SaaS.

Il ne doit PAS être automatiquement administrateur d'une école.

Il peut gérer :

### Établissements

- inscrire ;
- valider ;
- activer ;
- suspendre ;
- désactiver ;
- réactiver ;
- mettre en essai ;
- prolonger l'essai ;
- changer le plan ;
- consulter le statut ;
- consulter l'abonnement ;
- consulter les indicateurs SaaS.

Il ne doit PAS pouvoir consulter par défaut :

- notes individuelles ;
- bulletins ;
- données personnelles détaillées ;
- absences nominatives ;
- documents scolaires privés ;
- messages privés ;
- données pédagogiques.

Prévoir éventuellement un accès support/audit exceptionnel avec :

- justification ;
- durée limitée ;
- permission spécifique ;
- journalisation complète.

---

# 15. CYCLE DE VIE ÉCOLE

Implémenter une machine à états.

```text
PROSPECT
   ↓
PENDING
   ↓
TRIAL
   ↓
ACTIVE
   ↓
SUSPENDED
   ↓
ACTIVE
   ↓
EXPIRED
   ↓
CLOSED
```

Chaque transition doit être auditée.

---

# 16. ABONNEMENTS

Créer un système SaaS de plans.

Exemple :

```text
STARTER
STANDARD
PREMIUM
ENTERPRISE
```

Les plans peuvent limiter :

- nombre d'élèves ;
- nombre d'utilisateurs ;
- nombre d'enseignants ;
- nombre de classes ;
- stockage ;
- nombre de campus ;
- fonctionnalités IA ;
- SMS ;
- domaine personnalisé ;
- statistiques avancées.

---

# 17. FACTURATION

Prévoir :

- abonnement ;
- facture ;
- paiement ;
- renouvellement ;
- expiration ;
- remise ;
- période d'essai ;
- période de grâce ;
- historique.

Architecture compatible avec :

- Mobile Money ;
- carte ;
- virement ;
- paiement manuel ;
- futurs prestataires.

Ne pas coupler le métier à un fournisseur unique.

---

# 18. VITRINE DE CHAQUE ÉCOLE

Chaque école possède une vitrine publique indépendante.

Exemple :

```text
https://mon-ecole-1.ci
```

Elle doit pouvoir présenter :

- logo ;
- couleurs ;
- présentation ;
- histoire ;
- vision ;
- mission ;
- contacts ;
- adresse ;
- formations ;
- niveaux ;
- actualités ;
- événements ;
- galerie ;
- vidéos ;
- infrastructures ;
- témoignages ;
- formulaire de contact ;
- préinscription ;
- informations pratiques.

La vitrine doit utiliser l'identité graphique de l'école.

---

# 19. AUCUNE CONFUSION ENTRE PLATEFORME ET ÉCOLE

Lorsqu'un utilisateur visite :

```text
mon-ecole-1.ci
```

il doit rester dans l'univers de l'école.

Éviter :

```text
mon-ecole-1.ci
      ↓
mon-saas-ecole.ci/ecole/1
```

sauf nécessité technique invisible pour l'utilisateur.

Le domaine de l'école doit être traité comme une véritable entrée du tenant.

---

# 20. CONNEXION ÉCOLE

Le domaine de l'école doit permettre :

```text
mon-ecole-1.ci
      │
      ├── Vitrine
      │
      ├── Préinscription
      │
      └── Connexion
             │
             ▼
       Espace école
```

La connexion doit automatiquement déterminer le tenant.

---

# 21. GESTION DES UTILISATEURS

Prévoir :

```text
PLATFORM_ADMIN
SCHOOL_OWNER
SCHOOL_ADMIN
CAMPUS_ADMIN
DIRECTOR
ACCOUNTANT
TEACHER
PARENT
STUDENT
STAFF
```

Le système doit supporter RBAC + permissions fines.

---

# 22. STRUCTURE SCOLAIRE

Supporter :

```text
École
│
├── Campus
│
├── Sous-école
│
├── Cycle
│
├── Niveau
│
├── Classe
│
└── Salle
```

Exemple :

```text
Groupe scolaire ABC
│
├── Maternelle
├── Primaire
├── Collège
└── Lycée
```

---

# 23. ANNÉES SCOLAIRES

Supporter :

```text
2026-2027
2027-2028
2028-2029
```

avec :

- ouverture ;
- clôture ;
- archivage ;
- historique ;
- changement d'année ;
- migration des élèves ;
- passage en classe supérieure.

---

# 24. ÉLÈVES

Conserver/améliorer toutes les fonctionnalités existantes.

Prévoir notamment :

- matricule ;
- identité ;
- sexe ;
- date/lieu naissance ;
- nationalité ;
- origine ;
- photo ;
- classe ;
- historique ;
- ancien établissement ;
- ancienne classe ;
- moyenne précédente ;
- documents ;
- inscription ;
- réinscription.

Import :

- Excel ;
- CSV.

---

# 25. PARENTS

Un parent peut avoir plusieurs enfants.

```text
Parent
│
├── Enfant A
├── Enfant B
└── Enfant C
```

Le parent doit pouvoir consulter uniquement les informations autorisées de ses enfants.

---

# 26. ENTRÉE / SORTIE

Gérer :

- heure arrivée ;
- heure sortie ;
- retard ;
- absence ;
- personne récupérant l'enfant ;
- autorisation ;
- notification parent ;
- historique.

---

# 27. ENSEIGNANTS

Gérer :

- matières ;
- classes ;
- emploi du temps ;
- notes ;
- absences ;
- appréciations ;
- documents.

---

# 28. NOTES

Supporter :

- devoirs ;
- interrogations ;
- compositions ;
- examens ;
- oral ;
- projets ;
- contrôle continu ;
- coefficients ;
- moyennes.

Saisie :

- manuelle ;
- Excel ;
- CSV ;
- image ;
- voix ;
- assistance IA lorsque pertinent.

---

# 29. BULLETINS

Générer des bulletins configurables avec :

- identité école ;
- logo ;
- année ;
- trimestre/semestre ;
- matières ;
- notes ;
- coefficients ;
- moyennes ;
- rang ;
- appréciations ;
- absences ;
- décision ;
- signatures.

Export PDF/impression.

---

# 30. EMPLOI DU TEMPS

Supporter :

- création manuelle ;
- Excel ;
- CSV ;
- génération automatique ;
- contraintes horaires ;
- enseignants ;
- salles ;
- matières ;
- classes ;
- impression.

Adapter progressivement aux réalités du système éducatif ivoirien.

---

# 31. RESSOURCES ÉDUCATIVES GRATUITES

Créer un espace éducatif public accessible gratuitement.

```text
RESSOURCES
│
├── Cours
├── Exercices
├── Devoirs
├── Corrigés
├── Vidéos
├── Quiz
└── Documents
```

Organisation :

```text
Cycle
↓
Classe
↓
Matière
↓
Chapitre
↓
Cours
↓
Exercices
```

Accessible aux :

- élèves ;
- parents ;
- enseignants ;
- visiteurs.

---

# 32. IA

L'IA doit respecter les permissions.

Exemples :

- assistant enseignant ;
- assistant élève ;
- génération d'exercices ;
- quiz ;
- analyse des résultats ;
- recommandations ;
- assistance administrative.

L'IA ne doit jamais contourner le RBAC.

---

# 33. DASHBOARDS

Créer des dashboards adaptés à chaque rôle.

### SaaS

Uniquement :

- écoles ;
- abonnements ;
- plans ;
- essais ;
- revenus ;
- renouvellements ;
- consommation ;
- statistiques globales.

### École

- élèves ;
- enseignants ;
- classes ;
- résultats ;
- absences ;
- inscriptions.

### Enseignant

- classes ;
- notes ;
- absences ;
- emploi du temps.

### Parent

- enfants ;
- notes ;
- absences ;
- devoirs ;
- informations.

### Élève

- cours ;
- devoirs ;
- notes ;
- emploi du temps.

---

# 34. AUDIT

Journaliser :

```text
user
tenant
action
resource
resource_id
timestamp
IP
result
```

Exemples :

```text
CREATE_STUDENT
UPDATE_GRADE
EXPORT_DATA
SUSPEND_SCHOOL
CHANGE_PLAN
CHANGE_DOMAIN
```

---

# 35. FICHIERS

Les fichiers doivent être isolés par tenant.

Ne jamais exposer une URL publique prévisible.

Contrôler :

- permissions ;
- type ;
- taille ;
- antivirus ;
- stockage ;
- téléchargement ;
- suppression ;
- audit.

---

# 36. DEVSECOPS

Pipeline :

```text
CODE
 ↓
LINT
 ↓
UNIT TEST
 ↓
INTEGRATION TEST
 ↓
E2E
 ↓
SAST
 ↓
DEPENDENCY SCAN
 ↓
SECRET SCAN
 ↓
CONTAINER SCAN
 ↓
BUILD
 ↓
DEPLOY
```

Utiliser les outils déjà présents dans le projet lorsqu'ils existent.

---

# 37. TESTS DE SÉCURITÉ MULTI-TENANT

Créer obligatoirement des tests :

```text
École A → Élève A
École A → Élève B = REFUS
```

```text
École A → Note École B = REFUS
```

```text
École A → Document École B = REFUS
```

```text
École A → API École B = REFUS
```

```text
Parent A → Enfant B = REFUS
```

```text
Teacher A → Classe non autorisée = REFUS
```

---

# 38. TESTS DOMAINES

Créer des tests pour :

```text
mon-saas-ecole.ci
mon-ecole-1.ci
mon-ecole-2.ci
mon-ecole-3.ci
```

Vérifier :

```text
Host
 ↓
Domain resolver
 ↓
Tenant
 ↓
School
 ↓
Permissions
 ↓
Data
```

Tester également :

- domaine inconnu ;
- domaine suspendu ;
- domaine non vérifié ;
- domaine appartenant à une autre école ;
- changement de domaine ;
- suppression de domaine ;
- domaine principal ;
- domaine secondaire.

---

# 39. ADMINER EN DÉVELOPPEMENT

Si Docker est utilisé, prévoir si nécessaire :

```text
app
database
adminer
reverse-proxy
```

Exemple conceptuel :

```text
                    Reverse Proxy
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       SaaS App       API Backend     Adminer
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                      Database
```

Adminer ne doit PAS être exposé publiquement en production sans protection forte.

Il doit idéalement être :

- limité au réseau interne ;
- protégé par authentification ;
- accessible uniquement aux administrateurs techniques ;
- désactivé ou isolé en production si inutile.

---

# 40. BASE DE DONNÉES ET MIGRATIONS

Avant toute modification :

```text
ANALYSE
 ↓
BACKUP
 ↓
MIGRATION
 ↓
TEST
 ↓
VALIDATION
```

Ne jamais supprimer une table existante sans vérifier ses dépendances.

---

# 41. UX/UI

L'interface doit être :

- moderne ;
- responsive ;
- professionnelle ;
- simple ;
- mobile-first lorsque pertinent ;
- cohérente ;
- accessible.

Éviter les interfaces surchargées.

Prévoir des expériences différentes pour :

```text
Plateforme
École
Enseignant
Parent
Élève
```

---

# 42. SPÉCIFICITÉ IVOIRIENNE

Le premier marché cible est la Côte d'Ivoire.

Étudier sérieusement :

- maternelle ;
- primaire ;
- collège ;
- lycée ;
- technique ;
- professionnel.

Prendre en compte lorsque les règles sont vérifiées :

- niveaux ;
- cycles ;
- matières ;
- coefficients ;
- notation ;
- trimestres ;
- examens ;
- orientation ;
- passage ;
- redoublement ;
- bulletins ;
- documents scolaires.

Ne jamais inventer une règle réglementaire.

Toute règle officielle doit être vérifiée et documentée.

---

# 43. ANALYSE CONCURRENTIELLE

Avant les grandes évolutions, analyser les concurrents :

- Afrique ;
- Côte d'Ivoire ;
- Afrique francophone ;
- Europe ;
- États-Unis ;
- autres marchés pertinents.

Comparer :

- fonctionnalités ;
- UX ;
- prix ;
- SaaS ;
- multi-tenant ;
- parents ;
- élèves ;
- enseignants ;
- IA ;
- ressources pédagogiques ;
- communication ;
- domaines personnalisés ;
- sécurité.

Objectif :

> Construire une solution meilleure et plus adaptée au contexte ivoirien, pas simplement copier les concurrents.

---

# 44. ROADMAP

Priorité 1 :

```text
Multi-tenancy
RBAC
Écoles
Utilisateurs
Sécurité
Domaines
Cycle de vie
Abonnements
```

Priorité 2 :

```text
Élèves
Parents
Enseignants
Classes
Années scolaires
Notes
Absences
Bulletins
```

Priorité 3 :

```text
Vitrines
Emploi du temps
Documents
Notifications
Dashboards
```

Priorité 4 :

```text
Cours
Exercices
Vidéos
Quiz
Ressources gratuites
```

Priorité 5 :

```text
IA
Analytics
Automatisation
```

Priorité 6 :

```text
Domaines personnalisés avancés
Facturation automatisée
Scalabilité
Monitoring
DevSecOps
```

---

# 45. MÉTHODE D'IMPLÉMENTATION

Pour chaque fonctionnalité :

```text
1. Inspecter
2. Comprendre
3. Identifier les impacts
4. Proposer
5. Implémenter
6. Tester
7. Vérifier la sécurité
8. Vérifier la non-régression
9. Documenter
```

Ne jamais effectuer une grosse réécriture en une seule opération.

---

# 46. FORMAT DE COMPTE-RENDU

Après chaque étape, fournir :

## ANALYSE

Ce qui existait.

## MODIFICATIONS

Ce qui a été ajouté/modifié.

## BASE DE DONNÉES

Tables/migrations concernées.

## API

Endpoints concernés.

## FRONTEND

Pages/composants concernés.

## SÉCURITÉ

Contrôles effectués.

## TESTS

Tests exécutés.

## NON-RÉGRESSION

Fonctionnalités existantes vérifiées.

## RESTE À FAIRE

Prochaine étape.

---

# 47. CONSIGNE FINALE

Commence maintenant par :

### PHASE 1 — AUDIT UNIQUEMENT

Ne modifie aucun code.

Inspecte :

- dépôt ;
- architecture ;
- base ;
- Docker ;
- Adminer ;
- authentification ;
- RBAC ;
- modèles ;
- API ;
- frontend ;
- tests.

Puis produis :

```text
1. Architecture actuelle
2. Fonctionnalités existantes
3. Structure base de données
4. Rôles existants
5. Failles/risques
6. Problèmes de multi-tenancy
7. Architecture SaaS cible
8. Architecture des domaines personnalisés
9. Architecture Adminer
10. Plan de migration
11. Plan de tests
12. Roadmap priorisée
```

NE MODIFIE RIEN avant cette analyse.

---

# OBJECTIF FINAL

Nous voulons obtenir une plateforme pouvant fonctionner comme ceci :

```text
                  MON-SAAS-ECOLE.CI
                         │
               ┌─────────┴─────────┐
               │                   │
        Administration        Ressources
          SaaS                 éducatives
               │
       ┌───────┼────────┐
       │       │        │
       ▼       ▼        ▼
   ÉCOLE 1  ÉCOLE 2  ÉCOLE 3
       │       │        │
       ▼       ▼        ▼
 mon-ecole-1.ci
 mon-ecole-2.ci
 mon-ecole-3.ci
       │
       ▼
   Vitrine école
       │
       ▼
   Connexion
       │
       ▼
 Espace établissement
       │
 ┌─────┼─────┬─────────┐
 ▼     ▼     ▼         ▼
Élèves Parents Enseignants Direction
```

La plateforme doit être :

**multi-tenant + sécurisée + personnalisable + scalable + adaptée à la Côte d'Ivoire + compatible avec les domaines personnalisés + sans régression.**