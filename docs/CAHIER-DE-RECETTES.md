# Cahier de recettes fonctionnel

Parcours à dérouler à la main, rôle par rôle, pour valider l'évolution multi-écoles (`docs/AMELIORATIONS2.md`). Chaque parcours indique le résultat attendu et le test automatique qui couvre déjà la même règle côté serveur.

Les tests automatiques vérifient les règles et les droits ; ils ne remplacent pas cette recette, qui vérifie les **écrans**. Les écrans ajoutés ont été ouverts une fois dans Chrome (affichage et quelques parcours, voir `docs/EVOLUTION-MULTI-ECOLES.md`) ; les parcours qui modifient des données et l'usage sur téléphone restent à dérouler ici.

## Préparation

- Application de développement : `http://localhost:1300`, API `http://localhost:4000/api`.
- Comptes de démonstration (développement uniquement) : super administrateur `admin@school.local`, enseignant `k.kouassi@school.local`, secrétaire `secretaire@school.local`, parent `parent@school.local`.
- Navigateur : Chrome ou Edge récent (la dictée vocale et la lecture de carte par caméra n'existent pas ailleurs).
- Colonne « Résultat » : noter OK, KO ou « non applicable », avec la date et le nom du testeur.

## 1. Administrateur de la plateforme

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| P1 | Ouvrir « Plateforme » | Compteurs : groupes, établissements actifs, élèves, parents, enseignants, admissions en cours | e2e-dashboards | |
| P2 | Inscrire une école depuis `/signup` | L'école est créée avec son année et ses trois trimestres ; la personne inscrite se connecte comme administrateur | e2e-platform | |
| P3 | Dans « Plateforme », désactiver un établissement | Ses comptes sont déconnectés aussitôt ; le message indique que l'établissement est désactivé | e2e-group | |
| P4 | Réactiver le même établissement | Ses comptes peuvent se reconnecter | e2e-group | |
| P5 | Suspendre puis réactiver un abonnement | En suspension, l'école lit et exporte mais ne modifie plus rien | e2e-platform | |

## 2. Administrateur de groupe

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| G1 | « Établissements » → « Nouvel établissement » | Le nouvel établissement apparaît, avec son code ; année et trimestres prêts | e2e-group | |
| G2 | Créer deux fois le même nom | Refusé avec un message clair | e2e-group | |
| G3 | « Ouvrir » le second établissement | L'application redémarre sur son tableau de bord ; son nom s'affiche sous le logo ; ses listes sont vides | e2e-group | |
| G4 | Menu du compte → revenir au premier établissement | Les données du premier réapparaissent | e2e-group | |
| G5 | « Comptes » → rattacher un enseignant existant au second établissement | Il apparaît dans la liste ; il peut ouvrir cet établissement depuis son menu | e2e-group | |
| G6 | Rattacher une adresse d'un autre groupe | Refusé, sans indiquer si le compte existe | e2e-group | |
| G7 | Désactiver l'établissement ouvert | Refusé : il faut d'abord en ouvrir un autre | e2e-group | |

## 3. Direction d'un établissement

### Vitrine

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| D1 | « Annonces & vitrine » → lien « Préparer un brouillon » → modifier le slogan, la couleur, le mot du directeur, ajouter un événement → « Enregistrer le brouillon » | Bandeau « Brouillon non publié » ; la page publique n'a pas changé | e2e-showcase | |
| D2 | « Aperçu » | Un nouvel onglet montre la page avec le brouillon et un bandeau « Aperçu du brouillon » | e2e-showcase | |
| D3 | Ouvrir le lien d'aperçu sans être connecté | La page ne s'affiche pas | e2e-showcase | |
| D4 | « Publier » | La page publique affiche le nouveau contenu ; la couleur est appliquée aux titres des nouvelles sections | e2e-showcase | |
| D5 | Modifier puis « Abandonner le brouillon » | La page publique reste inchangée | e2e-showcase | |
| D6 | Sur la page publique, envoyer un message par le formulaire de contact | Message de confirmation ; la direction reçoit une notification et un e-mail | e2e-showcase | |

### Personnel et documents

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| D7 | « Personnel » → « Dossier » d'un membre → renseigner catégorie, contrat, contact d'urgence, compte bancaire → enregistrer | Le dossier est enregistré ; la catégorie s'affiche sous le poste | e2e-files | |
| D8 | Se connecter comme secrétaire et ouvrir le même dossier | Les coordonnées bancaires ne sont pas affichées ; pas de bouton Enregistrer | e2e-files | |

### Années scolaires et passage

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| D9 | « Années & passage » → « Nouvelle année » | L'année est créée « En préparation » avec trois trimestres | e2e-promotion | |
| D10 | « Ouvrir » l'année suivante | État « Ouverte » | e2e-promotion | |
| D11 | Choisir une classe et l'année d'arrivée | Tableau des élèves avec moyenne annuelle, décision du conseil et proposition ; la classe d'arrivée est nommée | e2e-promotion | |
| D12 | Changer une décision en « Orienté » sans choisir de classe, puis « Vérifier le passage » | Refusé : la classe d'arrivée est demandée | e2e-promotion | |
| D13 | « Vérifier le passage » avec des décisions complètes | Fenêtre de validation : nombre d'admis, de redoublants, d'orientés, de sortants, classes à créer. Rien n'est encore modifié | e2e-promotion | |
| D14 | « Exécuter le passage » | Les élèves sont dans leur nouvelle classe ; la fiche de chacun garde l'ancienne classe et son bulletin | e2e-promotion | |
| D15 | Refaire le même passage | Les élèves déjà placés sont signalés « Déjà en … » et ne bougent pas | e2e-promotion | |
| D16 | Définir la nouvelle année comme année en cours, puis clôturer l'ancienne | L'ancienne passe « Clôturée » | e2e-promotion | |
| D17 | Saisir une note dans une classe de l'année clôturée | Refusé avec le message « année clôturée » | e2e-promotion | |
| D18 | « Classes » : archiver une classe | Elle quitte la liste ; ses élèves et ses notes restent consultables | e2e-promotion | |

## 4. Secrétariat

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| S1 | Créer un élève avec régime, établissement précédent, moyenne précédente | La partie « Scolarité » de la fiche affiche ces informations | e2e-files | |
| S2 | Créer un parent avec deux enfants, téléphone secondaire, pièce d'identité | Le parent apparaît avec ses deux enfants | e2e-files | |
| S3 | Ouvrir la fiche de chaque enfant | Le parent y figure avec sa qualité et les mentions « Responsable légal », « Contact d'urgence » | e2e-files | |
| S4 | Fiche élève → onglet « Documents » → ajouter un PDF, type « Acte de naissance », visible par l'établissement uniquement | Le document apparaît, version 1, avec l'auteur | e2e-documents | |
| S5 | Ajouter un fichier qui n'est ni PDF ni image | Refusé | e2e-documents | |
| S6 | « Remplacer » le document | Version 2 ; l'ancienne se retrouve dans « Documents archivés » et s'ouvre encore | e2e-documents | |
| S7 | Archiver un document puis tenter de le supprimer | Le bouton de suppression n'existe que pour la direction, et seulement sur un document archivé | e2e-documents | |
| S8 | « Entrées et sorties » → rechercher un élève → « Carte » | La carte QR s'affiche et s'imprime | e2e-gate | |
| S9 | « Carte perdue : renouveler » | Une nouvelle carte s'affiche ; l'ancienne est refusée au portail | e2e-gate | |
| S10 | Admission : dérouler une candidature jusqu'à l'inscription | L'élève est créé à partir du dossier, sans ressaisie | e2e-admissions | |
| S11 | Fiche élève → « Ajouter une photo » | La photo d'identité s'affiche dans la fiche ; un PDF est refusé | e2e-pupil | |
| S12 | Fiche d'un élève sorti ou non placé → « Réinscrire » → choisir l'année et la classe | L'élève est inscrit dans la classe ; son dossier est repris, restauré s'il était archivé ; une classe complète est grisée | e2e-promotion | |
| S13 | Fiche élève → « Créer un compte élève » | Le mot de passe provisoire s'affiche une seule fois | e2e-pupil | |

## 5. Enseignant

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| E1 | Se connecter | Tableau de bord propre à l'enseignant : ses classes, ses élèves, ses cours du jour, les appels à faire. Aucun chiffre financier | e2e-dashboards | |
| E2 | « Classes » | Seules ses classes apparaissent | e2e-teacher-scope | |
| E3 | Ouvrir par son adresse une classe qui n'est pas la sienne | Accès refusé | e2e-teacher-scope | |
| E4 | Saisir une note dans une matière qu'il n'enseigne pas | Refusé | e2e-teacher-scope | |
| E5 | « Saisie rapide » → « Appel vocal » → choisir une classe → « Dicter » : « [Nom] présente. [Nom] absent. [Nom] en retard. » → « Analyser » | Une ligne par élève cité, avec le statut ; les élèves non cités sont listés | e2e-smart-entry | |
| E6 | Dicter un nom qui n'est pas dans la classe | La ligne apparaît « Non reconnu » ; « Valider » reste bloqué tant qu'elle n'est pas corrigée ou retirée | e2e-smart-entry | |
| E7 | Corriger puis « Valider l'appel » | L'appel est enregistré ; il apparaît dans « Présence » | e2e-smart-entry | |
| E8 | « Notes dictées » : « [Nom] 15, [Nom] 12 virgule 5, [Nom] 25 » | Deux notes reconnues ; la troisième est vide, signalée « dépasse le barème » | e2e-smart-entry | |
| E9 | Valider les notes | Les notes apparaissent dans « Notes & bulletins » | e2e-smart-entry | |
| E10 | « Notes sur photo » : photographier une feuille de notes | Chaque ligne lue est proposée ; les chiffres douteux sont vides et expliqués ; rien n'est enregistré avant validation. La mention d'envoi à un service externe est affichée | test unitaire uniquement | |
| E11 | Fiche d'un de ses élèves → « Documents » | Il voit les documents partagés avec la famille, pas les documents internes | e2e-documents | |
| E12 | « Entrées et sorties » : présenter une carte au lecteur | Bandeau vert « arrivée à hh:mm » ; une seconde présentation immédiate indique « déjà enregistré » | e2e-gate | |
| E13 | Enregistrer une sortie avant la fin des cours sans motif | Refusé : le motif est demandé | e2e-gate | |
| E14 | Sortie avec un responsable non autorisé à récupérer l'enfant | Le responsable est grisé dans la liste ; refusé côté serveur | e2e-gate | |

## 6. Parent

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| F1 | Se connecter avec un compte ayant plusieurs enfants | Un sélecteur permet de passer d'un enfant à l'autre | e2e-portal | |
| F2 | Onglet « Entrées et sorties » après un passage au portail | « Arrivée » et « Sortie » avec la date et l'heure ; mention du retard ou de la sortie anticipée | e2e-gate | |
| F3 | Cloche de notifications après un passage au portail | « Votre enfant … est arrivé(e) à hh:mm. » | e2e-gate | |
| F4 | Cloche après la saisie d'une note | « … a obtenu 15/20 en Mathématiques. » | e2e-dashboards | |
| F5 | Onglet « Documents » | Seuls les documents partagés avec la famille ; téléchargement possible | e2e-documents | |
| F6 | Essayer d'ouvrir l'adresse d'un document d'un autre élève | Refusé | e2e-documents | |
| F7 | Pré-inscription depuis la vitrine, puis suivi avec le numéro de dossier | Le numéro est remis à la fin ; le suivi affiche l'étape et les pièces attendues | e2e-admissions | |
| F8 | Bulletin d'un enfant passé en classe supérieure | Le bulletin de l'année écoulée reste consultable | e2e-promotion | |
| F9 | « Sécurité du compte » → décocher « Nouvelles notes » | La note suivante ne produit plus de notification ; recocher la rétablit | e2e-pupil | |
| F10 | Commencer une pré-inscription, fermer l'onglet, revenir | Bandeau « Brouillon repris » et champs remplis ; « Recommencer à zéro » vide le formulaire | passe manuelle | |

## 6 bis. Élève

| N° | Parcours | Résultat attendu | Test automatique | Résultat |
|---|---|---|---|---|
| V1 | Se connecter avec le compte créé par le secrétariat | Arrivée sur « Mon espace élève » : son dossier, sa classe | e2e-pupil | |
| V2 | Parcourir les onglets | Bulletins, absences, entrées et sorties, vie scolaire, devoirs, emploi du temps, documents. Pas d'onglet Scolarité (frais) ni Messages ; pas de bouton pour justifier une absence | e2e-pupil | |
| V3 | Saisir l'adresse d'un écran du personnel (`/students`, `/classes`) | Accès refusé | e2e-pupil | |
| V4 | Le secrétariat ferme le compte | L'élève est déconnecté aussitôt ; son dossier ne change pas | e2e-pupil | |

## 7. Points à contrôler sur téléphone

| N° | Parcours | Résultat attendu | Résultat |
|---|---|---|---|
| M1 | « Saisie rapide » : dictée de l'appel | Le micro démarre après autorisation ; le texte s'écrit pendant la dictée | |
| M2 | « Notes sur photo » | Le champ ouvre l'appareil photo | |
| M3 | « Entrées et sorties » → « Lire les cartes avec la caméra » | L'aperçu de la caméra s'affiche ; une carte présentée est enregistrée une fois | |
| M4 | Tableaux larges (passage de classe, documents) | Défilement horizontal du tableau, sans casser la page | |

## 8. Ce que la recette ne peut pas valider ici

- Envoi réel de SMS, paiement Mobile Money réel : comptes marchands à ouvrir.
- Lecture réelle d'une feuille de notes : elle transmet des noms d'élèves à un service externe ; à n'essayer qu'avec une feuille fictive tant que la politique de confidentialité ne le mentionne pas.
- Notifications push : non réalisées.
