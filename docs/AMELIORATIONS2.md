# PROMPT — ÉVOLUTION MAJEURE DE SCHOOL ERP

Tu travailles sur une application **School ERP professionnelle de gestion d'établissements scolaires**.

L'objectif est de faire évoluer l'application existante vers une solution **complète, moderne, multi-écoles, multi-utilisateurs, configurable et adaptée au fonctionnement réel des établissements scolaires**, notamment en Côte d'Ivoire.

## 1. RÈGLE FONDAMENTALE

Avant toute modification :

1. Analyse complètement l'application existante.
2. Identifie :
   - l'architecture frontend/backend ;
   - la base de données ;
   - les rôles et permissions existants ;
   - les fonctionnalités déjà disponibles ;
   - les modèles de données ;
   - les API existantes ;
   - les écrans existants ;
   - les workflows existants ;
   - les composants réutilisables.
3. Ne supprime aucune fonctionnalité existante sans justification.
4. Réutilise au maximum l'existant.
5. Évite de créer des doublons fonctionnels ou techniques.
6. Fais évoluer la base de données avec des migrations propres.
7. Vérifie la compatibilité avec les données existantes.
8. Toutes les nouvelles fonctionnalités doivent respecter les rôles, permissions et règles de sécurité existants.

**Ne commence pas directement à coder.**

Commence par produire un diagnostic de l'application et un plan d'évolution technique et fonctionnel.

---

# 2. ARCHITECTURE MULTI-ÉTABLISSEMENTS

L'application doit devenir nativement **multi-tenant**.

Prévoir au minimum les niveaux suivants :

### Administrateur général de la plateforme

Il peut :

- créer une école ;
- modifier une école ;
- désactiver une école ;
- consulter les écoles ;
- gérer les administrateurs des écoles ;
- superviser les établissements ;
- gérer les paramètres globaux ;
- gérer les abonnements/licences si cette fonctionnalité existe ou est prévue.

### Administrateur d'école

Un administrateur d'école peut :

- gérer son établissement ;
- gérer les élèves ;
- gérer les parents ;
- gérer les enseignants ;
- gérer le personnel ;
- gérer les classes ;
- gérer les inscriptions ;
- gérer les notes ;
- gérer les absences ;
- gérer les emplois du temps ;
- gérer les paiements si le module existe ;
- configurer la vitrine de son établissement.

### Groupe scolaire / établissement multi-écoles

Une école peut éventuellement contenir plusieurs établissements ou sous-écoles.

Exemple :

Groupe scolaire ABC
- École primaire ABC
- Collège ABC
- Lycée ABC

L'administrateur doit pouvoir créer et gérer ces établissements depuis son espace, tout en conservant une séparation claire des données.

Les données doivent être correctement isolées entre établissements.

---

# 3. VITRINE PUBLIQUE DE L'ÉCOLE

L'administrateur d'une école doit disposer d'un véritable **CMS de vitrine**.

Il doit pouvoir configurer sans intervention technique :

- logo ;
- favicon ;
- nom de l'école ;
- slogan ;
- description ;
- couleurs ;
- images ;
- bannière ;
- galerie photos ;
- présentation de l'établissement ;
- historique ;
- valeurs ;
- mot du directeur ;
- formations/filières ;
- classes disponibles ;
- infrastructures ;
- activités ;
- actualités ;
- événements ;
- coordonnées ;
- téléphone ;
- email ;
- localisation ;
- horaires ;
- réseaux sociaux ;
- documents téléchargeables ;
- formulaire de contact ;
- formulaire de pré-inscription.

Prévoir un système de **prévisualisation avant publication**.

La vitrine doit être responsive et professionnelle.

Chaque établissement doit pouvoir avoir une identité visuelle différente.

---

# 4. GESTION DES PARENTS

Un parent ne doit pas être limité à un seul enfant.

Un même compte parent peut être associé à :

- un élève ;
- plusieurs élèves ;
- des élèves appartenant à différentes classes ;
- éventuellement plusieurs établissements d'un même groupe scolaire.

Exemple :

Parent :
- Jean KOUASSI

Enfants :
- Alice KOUASSI — 6e
- Paul KOUASSI — CM2
- Marc KOUASSI — 3e

Le parent doit avoir un tableau de bord permettant de sélectionner l'enfant concerné.

Prévoir les informations parentales nécessaires :

- nom ;
- prénom ;
- sexe ;
- date de naissance ;
- nationalité ;
- pays d'origine ;
- téléphone ;
- téléphone secondaire ;
- email ;
- profession ;
- employeur ;
- adresse ;
- ville ;
- pays ;
- pièce d'identité ;
- numéro de pièce ;
- qualité avec l'enfant ;
- responsable légal ;
- contact d'urgence ;
- photo si nécessaire.

Prévoir également la gestion :

- père ;
- mère ;
- tuteur ;
- responsable légal ;
- personne à contacter en urgence.

---

# 5. DOSSIER ÉLÈVE COMPLET

Créer un véritable dossier numérique élève.

Prévoir notamment :

### Identité

- matricule ;
- nom ;
- prénom(s) ;
- sexe ;
- date de naissance ;
- lieu de naissance ;
- nationalité ;
- pays d'origine ;
- photo d'identité ;
- adresse ;
- ville ;
- pays ;
- téléphone si nécessaire ;
- email si nécessaire.

### Scolarité

- établissement ;
- année scolaire ;
- classe actuelle ;
- classe précédente ;
- établissement précédent ;
- moyenne précédente ;
- décision de passage ;
- régime scolaire ;
- statut de l'élève ;
- date d'entrée ;
- historique des classes.

### Documents

Prévoir le stockage sécurisé de :

- photo d'identité ;
- dernier bulletin ;
- certificat de naissance ;
- certificat de scolarité ;
- documents administratifs ;
- pièces justificatives ;
- autres documents.

Prévoir une gestion documentaire avec :

- type de document ;
- date ;
- version ;
- statut ;
- auteur ;
- visibilité ;
- téléchargement ;
- suppression contrôlée.

---

# 6. PRÉ-INSCRIPTION / RÉINSCRIPTION / INSCRIPTION

Mettre en place un véritable workflow d'inscription.

## Pré-inscription

Un parent ou candidat peut :

1. accéder à la vitrine ;
2. choisir l'établissement ;
3. choisir l'année scolaire ;
4. choisir le niveau/classe ;
5. remplir le formulaire ;
6. joindre les documents ;
7. soumettre la demande ;
8. recevoir un numéro de dossier ;
9. suivre l'état de la demande.

Statuts possibles :

- Brouillon
- Soumise
- En cours d'étude
- Informations complémentaires demandées
- Acceptée
- Refusée
- Inscription à finaliser
- Inscrite

## Réinscription

Permettre de réinscrire rapidement un élève déjà présent dans l'établissement.

Réutiliser automatiquement les données existantes tout en permettant leur mise à jour.

## Inscription

Après validation, transformer la pré-inscription en inscription officielle.

Éviter de recréer manuellement le dossier.

---

# 7. PASSAGE EN CLASSE SUPÉRIEURE

Prévoir un workflow de fin d'année scolaire.

L'administration doit pouvoir :

1. sélectionner une année scolaire ;
2. sélectionner une classe ;
3. afficher les élèves ;
4. déterminer les élèves admis ;
5. déterminer les élèves redoublants ;
6. déterminer les élèves sortants ;
7. déterminer les élèves orientés ;
8. sélectionner la classe suivante ;
9. générer automatiquement les nouvelles classes.

Exemple :

6e A 2025-2026

↓

5e A 2026-2027

Les élèves doivent être transférés automatiquement avec conservation de leur historique scolaire.

Prévoir une validation avant exécution.

---

# 8. CRÉATION ET GESTION DES CLASSES

Une classe doit contenir :

- nom ;
- niveau ;
- série/filière ;
- année scolaire ;
- établissement ;
- salle ;
- professeur principal ;
- capacité ;
- élèves ;
- emploi du temps ;
- matières ;
- historique.

Prévoir la possibilité :

- de créer une classe ;
- modifier une classe ;
- supprimer/archiver une classe ;
- affecter des élèves ;
- déplacer un élève ;
- affecter un professeur principal ;
- gérer les matières.

---

# 9. PRÉSENCE ET CONTRÔLE DES ENTRÉES/SORTIES

Mettre en place un module complet de présence.

Le système doit enregistrer :

### Entrée

- élève ;
- date ;
- heure ;
- établissement ;
- point d'accès ;
- méthode de détection ;
- utilisateur/système ayant enregistré l'entrée.

### Sortie

Même principe.

Le parent doit pouvoir consulter :

> Votre enfant Alice est arrivée à 07:32.

et :

> Votre enfant Alice a quitté l'établissement à 17:04.

Prévoir également :

- retard ;
- absence ;
- sortie exceptionnelle ;
- sortie anticipée ;
- personne autorisée à récupérer l'enfant.

Prévoir des notifications lorsque nécessaire.

---

# 10. APPEL DES ÉLÈVES PAR LE PROFESSEUR

Le professeur doit pouvoir effectuer l'appel rapidement.

Prévoir :

### Mode classique

Liste des élèves :

- présent ;
- absent ;
- retard ;
- justificatif.

### Mode vocal

Le professeur peut utiliser sa voix.

Exemple :

> "Alice KOUASSI présente."

> "Paul YAO absent."

Le système doit convertir la voix en actions structurées.

Prévoir une interface de validation avant enregistrement définitif afin d'éviter les erreurs de reconnaissance vocale.

Exemple :

**Reconnu :**

Alice KOUASSI → Présente  
Paul YAO → Absent  
Marc TRAORE → Retard

[Valider l'appel]

---

# 11. SAISIE DES NOTES

Le professeur doit pouvoir saisir les notes par plusieurs méthodes.

## Méthode 1 — Saisie manuelle

Tableau :

| Élève | Note |
|---|---|
| Alice | 15 |
| Paul | 12 |
| Marc | 17 |

## Méthode 2 — Saisie vocale

Exemple :

> "Alice 15, Paul 12, Marc 17."

Transformer automatiquement la commande en notes structurées.

Toujours permettre la vérification avant validation.

## Méthode 3 — Image

Le professeur peut photographier ou importer une feuille de notes.

Le système doit :

1. analyser l'image ;
2. détecter les noms ;
3. détecter les notes ;
4. faire correspondre les élèves ;
5. afficher le résultat ;
6. signaler les ambiguïtés ;
7. demander validation.

Ne jamais enregistrer automatiquement des données OCR incertaines.

## Méthode 4 — Import fichier

Accepter notamment :

- Excel ;
- CSV ;
- éventuellement autres formats pertinents.

Prévoir :

- aperçu ;
- validation des colonnes ;
- détection des erreurs ;
- correspondance des élèves ;
- import ;
- rapport d'erreurs.

---

# 12. PERSONNEL DE L'ÉTABLISSEMENT

Créer un véritable dossier personnel.

Types :

- enseignant ;
- surveillant ;
- éducateur ;
- administration ;
- direction ;
- comptabilité ;
- secrétariat ;
- personnel technique ;
- personnel de sécurité ;
- autre.

Informations à prévoir :

- matricule ;
- nom ;
- prénom ;
- sexe ;
- date de naissance ;
- lieu de naissance ;
- nationalité ;
- pays d'origine ;
- photo ;
- téléphone ;
- email ;
- adresse ;
- fonction ;
- poste ;
- département ;
- date d'embauche ;
- type de contrat ;
- statut ;
- diplôme ;
- qualification ;
- spécialité ;
- expérience ;
- documents administratifs ;
- pièces d'identité ;
- coordonnées bancaires si nécessaire et avec sécurité appropriée ;
- personne à contacter en urgence.

Prévoir l'affectation à un ou plusieurs établissements lorsque le modèle le permet.

---

# 13. ENSEIGNANTS

Un enseignant doit pouvoir avoir :

- plusieurs classes ;
- plusieurs matières ;
- un emploi du temps ;
- une liste d'élèves ;
- des évaluations ;
- des notes ;
- des appels ;
- des absences ;
- des statistiques.

Le système doit respecter strictement les permissions.

Un enseignant ne doit voir que les données auxquelles il est autorisé à accéder.

---

# 14. ANNÉES SCOLAIRES

Créer une vraie gestion des années scolaires.

Exemple :

2025-2026
2026-2027
2027-2028

Une année scolaire doit pouvoir être :

- créée ;
- ouverte ;
- configurée ;
- clôturée ;
- archivée.

La clôture d'une année doit conserver l'historique.

---

# 15. MODÈLE DE DONNÉES

Revoir le modèle de données afin de supporter proprement :

- plateformes ;
- groupes scolaires ;
- écoles ;
- établissements ;
- années scolaires ;
- utilisateurs ;
- rôles ;
- permissions ;
- élèves ;
- parents ;
- responsables légaux ;
- personnel ;
- enseignants ;
- classes ;
- matières ;
- inscriptions ;
- réinscriptions ;
- pré-inscriptions ;
- notes ;
- évaluations ;
- présences ;
- entrées/sorties ;
- documents ;
- emplois du temps ;
- notifications ;
- événements ;
- actualités ;
- configuration de vitrine.

Éviter les relations rigides qui empêcheraient l'évolution future.

---

# 16. RBAC ET SÉCURITÉ

Mettre en place une gestion fine des permissions.

Exemples :

### Super administrateur

Accès global.

### Administrateur groupe

Accès aux écoles de son groupe.

### Administrateur école

Accès à son école.

### Direction

Accès aux données administratives et pédagogiques autorisées.

### Enseignant

Accès à ses classes, matières, appels et notes.

### Parent

Accès uniquement à ses enfants.

### Élève

Accès uniquement à ses propres données.

### Personnel

Accès selon sa fonction.

Toutes les API doivent vérifier les permissions côté backend.

Ne jamais considérer le frontend comme une couche de sécurité.

---

# 17. TABLEAU DE BORD

Créer des dashboards adaptés à chaque rôle.

## Administrateur général

- nombre d'écoles ;
- nombre d'élèves ;
- nombre de parents ;
- nombre d'enseignants ;
- inscriptions ;
- statistiques globales.

## Administrateur école

- élèves ;
- enseignants ;
- personnel ;
- inscriptions ;
- absences ;
- retards ;
- classes ;
- statistiques.

## Enseignant

- classes ;
- élèves ;
- cours ;
- appels ;
- notes ;
- évaluations.

## Parent

- enfants ;
- présence ;
- horaires d'entrée/sortie ;
- notes ;
- absences ;
- annonces ;
- documents ;
- inscriptions.

---

# 18. IA ET AUTOMATISATION

L'application doit être conçue pour intégrer progressivement des fonctions d'IA.

Prévoir une architecture permettant notamment :

- reconnaissance vocale ;
- transcription ;
- OCR ;
- extraction de données ;
- import intelligent ;
- aide à la saisie ;
- détection d'anomalies ;
- génération de documents ;
- assistance administrative.

L'IA ne doit jamais modifier silencieusement une donnée critique.

Pour les opérations sensibles :

**IA → proposition → vérification humaine → validation → enregistrement.**

---

# 19. UX / UI

L'application doit avoir une interface :

- moderne ;
- professionnelle ;
- responsive ;
- rapide ;
- accessible ;
- cohérente ;
- adaptée au mobile ;
- adaptée au desktop.

Réduire les interfaces inutilement complexes.

Les actions fréquentes doivent être accessibles rapidement.

Exemple enseignant :

**Classe → Appel → Validation**

et

**Classe → Notes → Import/Vocal/Image → Vérification → Validation**

---

# 20. NOTIFICATIONS

Prévoir une architecture de notification extensible.

Canaux possibles :

- notification interne ;
- email ;
- SMS ;
- WhatsApp si intégré ultérieurement ;
- push notification.

Exemples :

- enfant arrivé ;
- enfant sorti ;
- absence ;
- retard ;
- nouvelle note ;
- nouvelle annonce ;
- demande d'inscription acceptée ;
- document disponible.

---

# 21. TRAÇABILITÉ

Toutes les opérations sensibles doivent être historisées.

Prévoir un audit log :

- utilisateur ;
- action ;
- date ;
- heure ;
- objet ;
- ancienne valeur ;
- nouvelle valeur ;
- adresse IP si pertinent ;
- résultat.

Exemple :

> ADMIN01 a modifié la classe de l'élève X de 5e A vers 4e B.

---

# 22. DOCUMENTS

Prévoir une gestion documentaire centralisée.

Les documents doivent pouvoir être :

- uploadés ;
- prévisualisés ;
- téléchargés ;
- remplacés ;
- archivés ;
- supprimés selon permissions.

Contrôler :

- taille ;
- type ;
- sécurité ;
- droits d'accès.

Les documents d'un élève ne doivent jamais être accessibles à un autre parent.

---

# 23. API

Toutes les fonctionnalités doivent être disponibles via une architecture API propre.

Respecter :

- validation des entrées ;
- authentification ;
- autorisation ;
- pagination ;
- filtres ;
- recherche ;
- gestion des erreurs ;
- logs ;
- documentation.

Les endpoints doivent être cohérents et versionnés lorsque nécessaire.

---

# 24. PERFORMANCE

L'application doit rester performante même avec :

- plusieurs écoles ;
- plusieurs milliers d'élèves ;
- plusieurs milliers de parents ;
- beaucoup de documents ;
- beaucoup de notes ;
- plusieurs années scolaires.

Prévoir :

- pagination ;
- indexation ;
- cache si nécessaire ;
- traitement asynchrone pour les opérations lourdes ;
- stockage adapté des fichiers ;
- optimisation des requêtes.

---

# 25. TESTS

Pour chaque fonctionnalité ajoutée, créer des tests.

Prévoir au minimum :

### Tests unitaires

- règles métier ;
- services ;
- validations.

### Tests API

- authentification ;
- permissions ;
- CRUD ;
- workflows.

### Tests fonctionnels

Tester les parcours complets :

**Administrateur général → création école**

**Administrateur école → configuration vitrine**

**Parent → plusieurs enfants**

**Parent → pré-inscription**

**Administration → validation inscription**

**Élève → changement de classe**

**Enseignant → appel vocal**

**Enseignant → notes vocales**

**Enseignant → import Excel**

**Enseignant → OCR des notes**

**Parent → consultation entrée/sortie**

---

# 26. MIGRATION ET COMPATIBILITÉ

Avant d'appliquer les modifications :

1. identifier les données existantes ;
2. créer les migrations ;
3. sauvegarder la base ;
4. migrer les données ;
5. vérifier les relations ;
6. vérifier les permissions ;
7. tester les fonctionnalités existantes.

Aucune fonctionnalité existante ne doit être cassée.

---

# 27. LIVRABLE ATTENDU

Travaille en plusieurs phases.

## PHASE 1 — AUDIT

Fournis :

- architecture actuelle ;
- fonctionnalités existantes ;
- technologies ;
- modèle de données ;
- points faibles ;
- risques ;
- éléments à conserver.

## PHASE 2 — ARCHITECTURE CIBLE

Propose :

- architecture cible ;
- modèle de données ;
- relations ;
- rôles ;
- permissions ;
- API ;
- workflows ;
- stratégie multi-tenant.

## PHASE 3 — PLAN DE DÉVELOPPEMENT

Découpe le travail en lots :

1. Multi-écoles
2. Utilisateurs / rôles
3. Élèves
4. Parents
5. Personnel
6. Classes
7. Inscriptions
8. Passage en classe supérieure
9. Présences
10. Entrées/sorties
11. Notes
12. Appel vocal
13. OCR
14. Import fichiers
15. Vitrine
16. Notifications
17. Documents
18. Dashboards
19. Audit
20. Tests

Pour chaque lot indique :

- fichiers à modifier ;
- tables à créer/modifier ;
- API ;
- interfaces ;
- dépendances ;
- tests.

## PHASE 4 — IMPLÉMENTATION

Implémente progressivement.

Après chaque lot :

1. lancer les tests ;
2. corriger les erreurs ;
3. vérifier les migrations ;
4. vérifier le frontend ;
5. vérifier le backend ;
6. vérifier les permissions ;
7. vérifier les performances.

## PHASE 5 — VALIDATION

À la fin, produire un **cahier de recettes fonctionnel complet** couvrant tous les rôles.

---

# 28. RÈGLE IMPORTANTE POUR L'AGENT DE DÉVELOPPEMENT

Ne crée pas une fonctionnalité uniquement parce qu'elle est techniquement possible.

Chaque fonctionnalité doit répondre à un véritable besoin métier scolaire.

Privilégie :

**simplicité → fiabilité → sécurité → performance → évolutivité → esthétique.**

Ne mets pas toute la logique métier dans le frontend.

Les règles critiques doivent être gérées côté backend.

Ne jamais exposer de données sensibles inutilement.

Ne jamais contourner les permissions.

Ne jamais supprimer de données existantes sans confirmation explicite et mécanisme d'archivage lorsque pertinent.

---

# OBJECTIF FINAL

Transformer l'application actuelle en un **School ERP professionnel, multi-écoles, multi-tenant et évolutif**, capable de couvrir la gestion réelle d'un établissement scolaire :

**Établissement → Administration → Élèves → Parents → Personnel → Enseignants → Classes → Inscriptions → Réinscriptions → Scolarité → Présences → Entrées/Sorties → Notes → Documents → Communication → Vitrine → Statistiques → IA → Audit.**

L'application doit être suffisamment structurée pour pouvoir évoluer ensuite vers :

- gestion financière ;
- paiements des frais de scolarité ;
- cantine ;
- transport scolaire ;
- bibliothèque ;
- internat ;
- gestion des examens ;
- bulletins ;
- emplois du temps avancés ;
- messagerie ;
- application mobile ;
- notifications push ;
- portail élève ;
- portail parent ;
- intégrations externes.

**Commence maintenant par PHASE 1 : AUDIT COMPLET DE L'APPLICATION EXISTANTE.**

Ne modifie aucun fichier avant d'avoir présenté l'audit et le plan d'implémentation.