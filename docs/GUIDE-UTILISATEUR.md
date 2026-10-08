# School ERP — Guide d'utilisation

Ce guide explique comment faire les tâches courantes, rôle par rôle. Chaque section tient sur un écran ; allez directement à la vôtre.

- [Pour tout le monde](#pour-tout-le-monde)
- [Enseignant](#enseignant)
- [Secrétariat](#secrétariat)
- [Comptable](#comptable)
- [Direction](#direction)
- [Parent](#parent)
- [Questions fréquentes](#questions-fréquentes)

---

## Pour tout le monde

### Se connecter
1. Ouvrez l'adresse de votre établissement et saisissez votre e-mail et votre mot de passe.
2. Si la double authentification est activée, saisissez le code à 6 chiffres de votre application (Google Authenticator, Authy…).

**Mot de passe oublié ou premier accès** : cliquez sur « Mot de passe oublié ? ». Vous recevez un lien par e-mail, valable une heure. C'est aussi la marche à suivre quand votre compte a été créé par un import : aucun mot de passe ne vous est envoyé, vous choisissez le vôtre.

Un mot de passe fait au moins 10 caractères, avec des lettres et des chiffres.

### Protéger son compte
Menu en haut à droite → **Sécurité du compte**. Vous pouvez y changer de mot de passe, activer la double authentification et fermer vos sessions sur les autres appareils. La double authentification est fortement recommandée pour la direction et la comptabilité.

### Installer l'application sur son téléphone
Depuis Chrome (Android) ou Safari (iPhone), ouvrez le menu du navigateur puis « Ajouter à l'écran d'accueil ». L'application s'ouvre ensuite comme une application ordinaire.

---

## Enseignant

### Faire l'appel
1. **Présence** → choisissez la classe et la date.
2. Tous les élèves sont présents par défaut : ne cochez que les absents et les retards.
3. **Enregistrer l'appel**.

**Sans réseau dans la salle** : faites l'appel normalement. Un message indique qu'il est conservé sur l'appareil ; il part tout seul dès que la connexion revient. Il faut avoir ouvert la page de présence au moins une fois avec du réseau sur cet appareil.

Si l'établissement a activé les SMS, les parents d'un élève absent sont prévenus le jour même.

### Saisir des notes
1. **Notes & bulletins** → classe, matière, période et type d'évaluation.
2. Saisissez les notes (sur 20 par défaut), puis **Enregistrer**.

Pour saisir beaucoup de notes d'un coup, utilisez **Imports Excel** → **Notes**.

### Rédiger les appréciations
**Notes & bulletins** → **Conseil de classe**. Saisissez l'appréciation dans la ligne de l'élève ; elle s'enregistre quand vous quittez le champ. Le bouton **Suggérer** propose un texte à partir des résultats : relisez-le et adaptez-le.

### Signaler un incident
**Vie scolaire** → **Nouveau signalement**. Indiquez l'élève, le type (observation, avertissement, retenue…), le motif et la décision. Décochez « Informer la famille » pour une note interne.

---

## Secrétariat

### Inscrire un élève
- Un par un : **Élèves** → **Nouvel élève**.
- Une liste entière : **Imports Excel** → **Élèves et responsables**. Téléchargez le modèle, remplissez-le, choisissez le fichier. L'application montre ligne par ligne ce qui sera importé et ce qui est à corriger ; rien n'est enregistré avant votre confirmation. Renvoyer le même fichier après correction ne crée pas de doublon.

### Suivre une admission
**Admissions** → ouvrez un dossier. Vous y trouvez les pièces à fournir, les étapes (dossier complet, étude, test, entretien, décision) et l'historique complet. Fixer une date de test ou d'entretien envoie une convocation par SMS si l'établissement l'a activé.

### Traiter les justificatifs d'absence
Quand un parent justifie une absence depuis son espace, la demande apparaît en haut de la page **Présence**. **Accepter** rend l'absence justifiée ; **Refuser** prévient la famille.

### Départ d'un élève
**Élèves** → supprimer l'élève l'**archive** : il quitte les listes mais son historique (notes, factures) est conservé. Il peut être restauré.

---

## Comptable

### Créer une facture et encaisser
1. **Facturation** → **Nouvelle facture** : élève, libellé, montant, échéance.
2. Pour un paiement au guichet : **Encaisser**, montant et moyen de paiement.

Les montants sont en francs CFA entiers. Un paiement ne peut pas dépasser le reste à payer.

### Faire payer en ligne
Dans le **Détail** d'une facture, **Lien de paiement** crée un lien à envoyer à la famille (SMS, WhatsApp, e-mail). La facture se met à jour dès que le paiement est confirmé. Les parents peuvent aussi payer depuis leur espace.

### Corriger une erreur
- **Rembourser** un paiement : il reste dans l'historique avec le statut « Remboursé » et son motif.
- **Annuler** une facture : possible seulement si elle ne porte aucun paiement ; elle reste visible avec le statut « Annulée ».

Rien n'est jamais effacé : c'est ce qui rend les comptes vérifiables.

### Relancer les impayés
**Messages aux familles** → **Relancer les impayés**. Chaque famille reçoit au plus une relance par facture et par semaine. Les relances partent aussi automatiquement chaque matin.

### Exporter pour la comptabilité
**Facturation** → **Exports comptables** : choisissez la période, puis le journal des encaissements ou les factures émises. Les fichiers s'ouvrent dans Excel.

### Reprendre les soldes d'un ancien système
**Imports Excel** → **Soldes d'ouverture** : une ligne par élève (matricule, montant dû). Chaque ligne devient une facture.

---

## Direction

### Voir l'essentiel de la semaine
**Synthèse & prévisions** résume la semaine en quelques phrases : présence, encaissements, factures passées en retard, classes sans notes, dossiers d'admission en attente. Vous recevez la même synthèse par e-mail chaque lundi matin. La **prévision d'encaissement** applique à vos impayés actuels les taux de paiement observés sur vos propres factures passées.

### Préparer le conseil de classe et les bulletins
**Notes & bulletins** → **Conseil de classe** :
- moyennes, rangs (avec ex æquo), distinctions et absences de chaque élève ;
- **Tous les bulletins (PDF)** pour imprimer la classe en une fois ;
- à la dernière période : moyenne annuelle (le premier trimestre compte une fois, les suivants deux fois) et décision du conseil, que seule la direction enregistre.

Les parents voient un bulletin dans leur espace une fois la période terminée.

### Gérer le personnel
**Personnel** → créer un compte, changer son statut (actif, inactif, archivé). Archiver un compte coupe immédiatement ses sessions.

### Vérifier qui a fait quoi
**Journal d'audit** : chaque création, modification, suppression et accès refusé, avec l'auteur, la date et l'état avant modification. Les mots de passe et les données de santé n'y figurent jamais.

### Données personnelles
**Données personnelles** permet de :
- **exporter** tout ce que l'établissement détient sur un élève (à remettre à la famille qui le demande) ;
- **anonymiser** un dossier archivé : l'identité de l'élève et de ses responsables est effacée, les notes et les factures restent sans nom. Cette action est définitive ;
- régler la **durée de conservation** après le départ d'un élève (5 ans par défaut).

### Régler les SMS
**Messages aux familles** : choisissez quels événements envoient un SMS, fixez un plafond mensuel et consultez le journal de tous les messages. Un parent qui refuse les SMS se règle dans **Parents**.

---

## Parent

Votre espace s'ouvre directement après la connexion. Si vous avez plusieurs enfants, choisissez-en un en haut de la page.

| Onglet | Ce que vous y trouvez |
|---|---|
| **Résumé** | Dernières notes et présence récente |
| **Bulletins** | Moyenne, rang et appréciation de chaque période terminée ; bulletin à télécharger |
| **Absences** | Absences et retards ; bouton **Justifier** pour expliquer une absence |
| **Vie scolaire** | Observations, sanctions et encouragements |
| **Emploi du temps** | Les cours de la semaine |
| **Scolarité** | Factures, ce qui reste à payer, bouton **Payer** (Mobile Money ou carte) |

Pour ne plus recevoir de SMS, demandez-le au secrétariat. Vos droits sur vos données sont expliqués sur la page « Protection des données personnelles », accessible depuis la page de connexion.

---

## Questions fréquentes

**Je n'ai pas reçu l'e-mail de réinitialisation.** Vérifiez les courriers indésirables. Trois demandes au plus sont possibles par heure pour une même adresse.

**« Trop de tentatives ».** Après 10 erreurs de mot de passe, le compte est bloqué 15 minutes. Attendez ou réinitialisez le mot de passe.

**Un import refuse des lignes.** Le motif est indiqué pour chaque ligne (date illisible, classe introuvable, téléphone invalide…). Corrigez le fichier et renvoyez-le : les lignes déjà importées sont ignorées.

**Un parent dit ne pas recevoir les SMS.** Vérifiez son numéro dans **Parents**, qu'il n'a pas refusé les SMS, et le journal dans **Messages aux familles** : la raison d'un message non envoyé y figure (numéro invalide, plafond atteint, aucun opérateur configuré).

**Le bulletin d'un élève est vide.** Il faut des notes pour la période et que les matières soient rattachées à la classe avec leur coefficient.

**J'ai fait l'appel hors connexion et je ne le vois pas.** Un bandeau indique les appels en attente. Ils partent quand l'appareil retrouve le réseau ; vous pouvez aussi cliquer sur « Envoyer maintenant ».
