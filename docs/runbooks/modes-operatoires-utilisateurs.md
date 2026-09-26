# Modes opératoires — Utilisateurs

> Version 1.1 · Un mode opératoire par tâche, regroupés par rôle. Les libellés entre guillemets sont ceux affichés à l'écran.
> Sur smartphone, les rubriques principales sont dans la barre du bas ; les autres sont dans « Plus ».
> Vous ne voyez que les rubriques autorisées pour votre rôle. Si une action est refusée (« Vous n'avez pas les droits pour cette action »), adressez-vous à la direction.

## 1. Pour tous

### 1.1 Se connecter
1. Ouvrir l'adresse de votre établissement (ex. `https://votre-ecole.plateforme.com` ou le lien fourni).
2. Saisir « Adresse email » et « Mot de passe », puis « Se connecter ».
3. Si la double authentification est active : ouvrir l'application d'authentification du téléphone, saisir le « Code de vérification » à 6 chiffres, puis « Valider ».

Résultat : vous arrivez sur votre page d'accueil (tableau de bord, « Mes enfants » pour les parents, « Écoles et plans » pour l'opérateur).
En cas d'échec : le message « Email ou mot de passe incorrect » ne précise pas lequel des deux est faux ; c'est volontaire. Après 10 tentatives en une minute, patientez une minute.

### 1.2 Mot de passe oublié
1. Sur l'écran de connexion, cliquer « Mot de passe oublié ? ».
2. Saisir votre adresse email puis « Recevoir le lien ».
3. Ouvrir l'email « Réinitialisation de votre mot de passe » et cliquer le lien (valable **15 minutes**, utilisable **une seule fois**).
4. Saisir deux fois le nouveau mot de passe (10 caractères minimum, une phrase de passe est recommandée), puis « Enregistrer ».

### 1.3 Activer la double authentification (fortement recommandé : direction, comptabilité)
1. Cliquer sur votre nom en bas du menu, puis choisir « Mon profil ».
2. Dans « Double authentification », cliquer « Configurer ».
3. Dans votre application (Google Authenticator, Microsoft Authenticator…), ajouter un compte avec la clé affichée (sur mobile : « ouvrir directement l'application »).
4. Saisir le code affiché par l'application, puis « Activer ».

### 1.4 Notifications
L'icône en forme de cloche indique le nombre de notifications non lues : absences, paiements reçus, rappels, publication d'un emploi du temps. Cliquer une notification la marque comme lue ; « Tout marquer comme lu » vide la liste.

### 1.5 Se déconnecter
Cliquer « Déconnexion » (en haut à droite). Sur un ordinateur partagé, déconnectez-vous toujours.

## 2. Direction

### 2.1 Personnaliser l'identité et la vitrine publique
1. Menu « Vitrine et identité », onglet « Identité visuelle ».
2. Renseigner le nom, le slogan, le directeur, les coordonnées, l'URL du logo.
3. Choisir la « Couleur principale » : l'indicateur « Contraste avec le texte blanc » doit afficher « lisible (AA) ». Sinon l'enregistrement est refusé ; choisir une teinte plus foncée.
4. Onglet « Vitrine publique » : cocher « Vitrine publiée », remplir le titre et la description pour Google, puis les réseaux sociaux.
5. Pour chaque section (Présentation, Mot du directeur, Valeurs, Équipe, Galerie, Actualités, Agenda, Documents, Préinscription, Contact) : cocher « Visible », ordonner avec ↑ / ↓, saisir le titre et le texte, puis « Ajouter un élément » pour les galeries et les listes.
6. Cliquer « Enregistrer », puis « Voir la vitrine » pour contrôler le rendu.

Bon à savoir : le texte est affiché tel quel (pas de HTML). Seuls les liens `https://` sont acceptés.

### 2.2 Publier une actualité
Menu « Annonces », puis « Nouvelle annonce ». Saisir « Titre » et « Contenu », puis enregistrer. L'annonce apparaît dans la section « Actualités » de la vitrine. « Dépublier » la retire sans la supprimer.

### 2.3 Traiter les messages et préinscriptions reçus
- Messages : « Vitrine et identité », onglet « Messages ». Répondre par email, puis cliquer « Marquer comme traité ».
- Préinscriptions : menu « Admissions ». Chaque demande en ligne y arrive avec le statut « Candidature ». Faire avancer le dossier avec les boutons d'étape. Le passage à « Inscription » crée automatiquement la fiche élève avec son matricule.

### 2.4 Gérer le personnel et les comptes
1. Menu « Personnel », puis le bouton de création.
2. Renseigner « Prénom », « Nom », « Email », « Rôle » (Directeur, Secrétaire, Comptable, Enseignant), « Poste », « Date d'embauche ».
3. Valider. Un **mot de passe provisoire est affiché une seule fois** : le transmettre à la personne de façon confidentielle. Elle pourra le changer via « Mot de passe oublié ».

Le salaire n'est visible que par la direction et la comptabilité. La création, la modification de salaire et la suppression sont inscrites au journal d'audit.

### 2.5 Construire les emplois du temps
1. Préalable : dans chaque classe, affecter les matières et leurs enseignants. Le nombre d'heures par semaine vaut 2 par défaut et se règle par matière.
2. Menu « Emplois du temps ». Choisir la « Classe » et ouvrir « Générer un brouillon ».
3. Régler les contraintes : « Heures max d'une matière par jour », « Demi-journée libérée » et « À partir de l'heure n° » (ex. mercredi à partir de la 5ᵉ heure).
4. Cliquer « Générer pour … » (une classe) ou « Générer pour toutes les classes ». Le résumé indique les heures placées et celles impossibles à placer.
5. Onglet « Brouillon » : la bannière indique les conflits (enseignant en double, salle occupée, heures manquantes…). Les cases en rouge portent le détail au survol.
6. Sans conflit bloquant, cliquer « Publier ». Les enseignants concernés reçoivent une notification.
7. Version « Publié » : « Excel (CSV) », « Calendrier (.ics) » (à importer dans Google Agenda ou Outlook) et « Imprimer / PDF ».

Vous pouvez aussi demander à l'assistant : « Génère un brouillon d'emploi du temps pour la 6ème A avec le mercredi après-midi libre ». Le brouillon attend alors votre confirmation.

### 2.6 Émettre un document officiel (certificat, attestation…)
1. Menu « Documents », onglet « Générer ».
2. Choisir le « Modèle » puis l'« Élève ».
3. Cliquer « Aperçu » et vérifier. Un avertissement « Données manquantes » signale les champs à compléter dans la fiche.
4. Cliquer « Générer le document ». Il reçoit un numéro (DOC-AAAA-NNNNN) et un QR code.
5. « Imprimer / enregistrer en PDF » : choisir A4 et « Enregistrer au format PDF » pour obtenir un fichier.

Toute personne qui scanne le QR code voit une page « Document authentique » (établissement, type, numéro, date), sans aucune donnée personnelle. L'onglet « Historique » conserve tous les documents émis.

### 2.7 Créer ou adapter un modèle de document
1. Onglet « Modèles », puis « Modifier » sur un modèle.
2. Coller ou modifier le contenu. Les variables s'insèrent depuis la colonne « Variables disponibles » (ex. `{{student.lastName}}`).
3. Pour un modèle Word existant, coller le texte avec ses zones du type `[Nom élève]` ou `« Classe »`, puis « Analyser le modèle ». Vérifier les correspondances proposées, puis « Appliquer les correspondances proposées ».
4. « Enregistrer une nouvelle version ». Les documents déjà émis ne changent pas ; ils restent liés à leur version.

### 2.8 Utiliser l'assistant IA
1. Menu « Assistant IA ». Poser la question en français, par exemple :
   - « Combien d'élèves ont des impayés ? »
   - « Prépare la liste des élèves ayant une moyenne inférieure à 10 »
   - « Crée une nouvelle classe 6ème B »
   - « Crée-moi un tableau de bord pour suivre les impayés »
   - « Ajoute une section actualités sur ma vitrine »
2. Les pastilles sous la réponse indiquent les données consultées.
3. **Actions sensibles** (création, relance, génération, modification de la vitrine) : une carte « Action à confirmer » décrit précisément l'action. Rien n'est fait tant que vous n'avez pas cliqué « Confirmer ». « Annuler » l'abandonne. Sans réponse, la carte expire au bout de 10 minutes.
4. Tableau de bord proposé : « Enregistrer ce tableau de bord », puis le retrouver dans « Mes tableaux ».

L'assistant voit exactement ce que vous voyez, ni plus ni moins. Chaque échange est tracé dans le journal d'audit.

### 2.9 Contrôler l'activité : journal d'audit
Menu « Journal d'audit ». Filtrer par ressource (Paie, Factures, Notes, Comptes, Assistant IA…). Chaque ligne indique la date, l'auteur, l'action et le détail.

## 3. Secrétariat

### 3.1 Inscrire un élève
Menu « Élèves », puis « Nouvel élève ». Renseigner prénom, nom, date de naissance, sexe et classe, puis « Créer l'élève ». Le matricule est attribué automatiquement (AAAA-NNNN).
**Changer de classe** : ouvrir la classe d'origine et retirer l'élève, puis l'inscrire depuis la nouvelle classe.

### 3.2 Enregistrer un parent
Menu « Parents », puis le bouton de création. Remplir l'identité et le lien de parenté, et cocher les « Enfants rattachés ». Pour que le parent accède au portail, un compte « Parent » doit lui être créé.

### 3.3 Traiter une candidature
Voir 2.3.

## 4. Comptabilité

### 4.1 Émettre une facture
Menu « Facturation », puis « Nouvelle facture ». Choisir l'« Élève », puis saisir le « Libellé », l'« Échéance » et les lignes (libellé, « Montant (FCFA) »). Cliquer « Créer la facture ». La référence (INV-AAAA-NNNNN) est attribuée automatiquement.

### 4.2 Encaisser un paiement
Sur la ligne de la facture, lancer l'encaissement. Saisir le « Montant (FCFA) », le « Moyen de paiement » (espèces, Orange Money, MTN, Moov, Wave, virement, chèque, carte) et la « Référence (optionnel) », puis « Confirmer le paiement ».
- Un paiement partiel passe la facture en « Partiellement payée ».
- Un montant supérieur au reste à payer est **refusé** : le message indique le reste exact.
- Les parents reliés à un compte reçoivent une notification « Paiement reçu ».

### 4.3 Relancer les impayés
Menu « Facturation », puis « Relancer les impayés échus ». Toutes les factures dont l'échéance est dépassée passent « En retard », et les parents reçoivent un rappel. Le bandeau indique le nombre de factures et de parents relancés.

### 4.4 Préparer la paie du mois
1. Menu « Paie ». Vérifier que chaque salarié a un « Salaire de base ».
2. Choisir la « Période » et lancer la génération des bulletins.
3. « Ajuster » : saisir primes et retenues, puis « Enregistrer ».
4. « Valider », puis « Payer » une fois le virement effectué. Un bulletin payé ne peut plus être modifié.
5. Télécharger le bulletin de paie PDF de chaque salarié.

## 5. Enseignants

### 5.1 Faire l'appel (ordinateur, tablette ou téléphone)
1. Menu « Présences » (barre du bas sur mobile).
2. Choisir la « Classe » ; la « Date » du jour est proposée.
3. « Tout marquer présent », puis corriger les absents et les retards.
4. « Enregistrer la présence ». Les parents des absents et des retardataires reçoivent une notification.

### 5.2 Saisir des notes et éditer un bulletin
1. Menu « Notes et bulletins ». Choisir « Classe », « Matière », « Période » et « Type d'évaluation ».
2. Saisir les notes sur 20, puis « Enregistrer les notes ».
3. Colonne « Bulletin » : télécharger le bulletin PDF de l'élève (moyennes pondérées, rang).

### 5.3 Consulter son emploi du temps
Menu « Emplois du temps » : la semaine type publiée, toutes classes confondues.

## 6. Parents

### 6.1 Suivre ses enfants
Menu « Mes enfants ». Choisir l'enfant (s'il y en a plusieurs). Vous voyez ses dernières notes, ses présences et ses factures avec le reste à payer. Les notifications signalent les absences, les paiements et les rappels.

### 6.2 Préinscrire un enfant (sans compte)
Sur la vitrine de l'établissement, cliquer « Préinscrire mon enfant ». Remplir le formulaire et envoyer. Un email d'accusé de réception contient la référence de la demande.

## 7. Opérateur de la plateforme (SaaS)

Voir `modes-operatoires-exploitation.md` §7 : créer une école, changer de plan, activer un module pour une école, déclarer un domaine personnalisé, suspendre une école.
