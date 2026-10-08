# Évolution multi-écoles : audit, architecture et état des lots

Réponse au cahier des charges `docs/AMELIORATIONS2.md`. Mis à jour le 4 octobre 2026, branche `feature/robustness`.

« Fait » signifie : codé et vérifié par des tests automatiques. Les écrans ajoutés pendant ce chantier ont été ouverts une fois dans Chrome, à la main, sur l'application locale (voir « Vérifications ») ; ils n'ont pas de test automatique dans un navigateur.

## 1. Audit de l'existant (phase 1)

L'application de départ couvrait déjà une grande partie du besoin : API NestJS et base PostgreSQL cloisonnée par école, interface Next.js installable, authentification avec double facteur, chiffrement des données sensibles, journal d'audit, admissions, bulletins, facturation, paiement en ligne, SMS, portail parents, imports Excel.

Les écarts relevés par rapport au cahier des charges :

| Constat | Gravité | Traitement |
|---|---|---|
| Un enseignant pouvait lire et saisir notes et appels de toutes les classes de son école | Sécurité | Corrigé (lot 1) |
| Un utilisateur n'appartenait qu'à une école ; le rôle d'administrateur de groupe n'avait aucun pouvoir | Structure | Corrigé (lot 2) |
| Le matricule élève était unique sur toute la plateforme | Structure | Corrigé (lot 2) |
| La qualité d'un parent (père, mère, tuteur) était portée par le parent, pas par le lien avec chaque enfant | Modèle | Corrigé (lot 3) |
| Modifier les enfants d'un parent supprimait ses liens avec des enfants d'une autre école | Défaut | Corrigé (lot 3) |
| Une école pouvait définir l'année d'une autre école comme année en cours | Sécurité | Corrigé (lot 5) |
| Les années créées avaient des trimestres aux dates vides | Défaut | Corrigé (lot 5) |
| Pas de gestion documentaire, pas de passage de classe, pas de suivi des entrées et sorties, pas de saisie vocale ni par image, vitrine sans brouillon | Fonction | Lots 4 à 9 |

## 2. Architecture retenue (phase 2)

- **Groupe et établissements.** Une organisation est un groupe scolaire ; elle contient un ou plusieurs établissements. Chaque établissement garde ses élèves, ses classes, ses factures. Un compte travaille dans un établissement à la fois et peut en changer s'il est rattaché à plusieurs (table `SchoolMembership`).
- **Rôles.** Super administrateur (plateforme), administrateur de groupe (toutes les écoles de son groupe), direction, secrétariat, comptabilité, enseignant (ses classes et ses matières), parent (ses enfants). Les contrôles sont faits par l'API ; l'interface ne fait que masquer.
- **Historique scolaire.** Une inscription par élève et par classe, avec son résultat de fin d'année. L'historique d'un élève est la liste de ses inscriptions ; rien n'est écrasé lors d'un passage.
- **Année scolaire.** En préparation → ouverte → clôturée → archivée. Une année clôturée est gelée : ni note, ni appel, ni inscription.
- **Assistance (voix, image).** Toujours : proposition → vérification par une personne → validation → enregistrement. Les routes d'assistance n'écrivent rien ; l'enregistrement passe par les routes habituelles et leurs contrôles.
- **Fichiers.** Stockage privé, contrôle du contenu réel du fichier, antivirus optionnel, téléchargement uniquement par l'API après vérification des droits.

## 3. État des lots (phases 3 et 4)

| Lot du cahier des charges | État | Détail |
|---|---|---|
| 1. Multi-écoles | Fait | Groupes, création et désactivation d'établissements, changement d'établissement, matricule par école. Pas de cloisonnement au niveau PostgreSQL (RLS) |
| 2. Utilisateurs et rôles | Fait | Périmètre enseignant, rattachements par école, rôles de connexion surveillant et éducateur (portail, appel, vie scolaire ; ni notes ni finances). Les autres catégories (sécurité, technique) restent des catégories du dossier, sans connexion. Pas de permissions fines par utilisateur : la table `Permission` reste inutilisée |
| 3. Élèves | Fait | Fiche étendue (origine, régime, scolarité antérieure, date d'entrée), photo d'identité, historique des classes |
| 4. Parents | Fait | Plusieurs enfants, lien par enfant (qualité, responsable légal, contact d'urgence, autorisé à récupérer l'enfant), fiche étendue, pièce d'identité chiffrée |
| 5. Personnel | Fait | Dossier (catégorie, contrat, diplômes, contact d'urgence, compte bancaire chiffré), rattachement à plusieurs établissements |
| 6. Classes | Fait | Série, salle, archivage, déplacement d'un élève avec historique |
| 7. Inscriptions | Fait | Le parcours d'admission existant est conservé (10 étapes, pièces, suivi public). Réinscription individuelle depuis la fiche élève. Le brouillon d'une pré-inscription est gardé sur l'appareil de la famille, pas sur le serveur : il ne se retrouve pas d'un appareil à l'autre |
| 8. Passage en classe supérieure | Fait | Aperçu, proposition, décision, plan, exécution confirmée, création des classes manquantes, relance sans effet |
| 9. Présences | Fait | Appel existant, plus dictée vocale |
| 10. Entrées et sorties | Fait | Carte QR, saisie manuelle, retards, sorties anticipées, personnes autorisées, notification des familles |
| 11. Notes | Fait | Saisie manuelle et import existants, plus dictée et lecture d'une feuille |
| 12. Appel vocal | Fait | Reconnaissance vocale du navigateur (Chrome, Edge), champ de texte en secours |
| 13. OCR | Fait côté application | Lecture par Claude si `ANTHROPIC_API_KEY` est renseignée. **Aucun appel réel au service n'a été fait pendant les tests** |
| 14. Import de fichiers | Fait | Existant ; un enseignant n'importe plus que pour ses classes et ses matières |
| 15. Vitrine | Fait | Brouillon, aperçu, publication, contenus supplémentaires, formulaire de contact. Le brouillon ne couvre pas les photos, chiffres clés, partenaires et témoignages, publiés dès leur enregistrement. L'onglet du navigateur affiche le favicon de l'école, ou son logo |
| 16. Notifications | Partiel | Interne, e-mail, SMS et WhatsApp. Nouveaux événements : arrivée, sortie, nouvelle note, document disponible. Chaque compte choisit les catégories qu'il reçoit dans l'application. Notifications push codées : l'appareil affiche un message générique, sans contenu ; elles restent **éteintes tant que les clés du serveur ne sont pas générées**, et n'ont pas été essayées sur un vrai appareil |
| 17. Documents | Fait | Catégorie, version, archive, visibilité, suppression contrôlée, partage avec la famille |
| 18. Tableaux de bord | Fait | École (existant), enseignant, plateforme, parent (portail), élève (son propre dossier en lecture seule, sans les frais) |
| 19. Audit | Fait | Existant : auteur, action, objet, anciennes et nouvelles valeurs, adresse IP, résultat |
| 20. Tests | Fait | Voir ci-dessous |

## 4. Vérifications

- 251 tests unitaires côté API, 30 côté web.
- 28 scénarios de bout en bout sur l'API, 617 vérifications, tous exécutés ensemble après le dernier lot.
- Les migrations (10 nouvelles) sont appliquées sur la base de développement et comparées au schéma : aucune différence.
- Les 2 575 liens parent-enfant existants ont été repris avec leur qualité.

### Ce qui a été vu dans un navigateur

Une passe manuelle dans Chrome, le 4 octobre 2026, sur l'application locale et les comptes de démonstration :

- Affichage sans erreur : Établissements, Plateforme (avec ses compteurs), Années & passage, Entrées et sorties, Saisie rapide, brouillon de vitrine, page publique avec son formulaire de contact, Personnel et son dossier, fiche élève (scolarité, parents, documents, photo, réinscription, compte élève), tableau de bord enseignant, portail parents (onglets Entrées et sorties et Documents), préférences de notification, formulaire de pré-inscription.
- Parcours joués : recherche d'un élève au portail et affichage de sa carte QR ; appel dicté (saisi au clavier) jusqu'à la proposition, avec un nom inconnu qui bloque bien la validation ; ouverture du dossier d'un membre du personnel ; ouverture de la fenêtre de réinscription ; reprise puis abandon d'un brouillon de pré-inscription.

### Ce qui n'est pas vérifié

- Les parcours qui modifient les données de démonstration n'ont pas été joués dans le navigateur (exécution d'un passage de classe, publication d'une vitrine, enregistrement d'un passage au portail, création d'un compte élève) : ils sont couverts par les tests de l'API, pas par un clic.
- Aucun test automatique dans un navigateur ne couvre ces écrans : le navigateur de test n'a pas pu être installé dans le conteneur.
- Rien n'a été essayé sur téléphone.
- La dictée vocale au micro et la lecture de carte par caméra dépendent du navigateur et du matériel : elles n'ont pas été essayées.
- Les notifications push n'ont pas été reçues sur un appareil : la signature et les garde-fous sont testés, pas la livraison par Google, Mozilla ou Apple. Elles ne fonctionnent qu'en production (application installée, HTTPS).
- Les écrans des comptes élève, surveillant et éducateur n'ont pas été ouverts dans le navigateur ; leurs droits sont testés côté API.
- La lecture d'une feuille de notes par le service externe n'a pas été appelée en vrai ; seul le traitement de sa réponse est testé.
- L'intégration continue n'a jamais tourné : la branche n'est pas poussée.

## 5. Choix faits sans validation, à confirmer

1. **Un compte travaille dans un établissement à la fois**, pour toutes ses sessions (pas un établissement par onglet).
2. **La personne qui inscrit son école devient administrateur de groupe**, pour pouvoir ajouter d'autres établissements.
3. **Reconnaissance vocale par le navigateur** : gratuite, mais limitée à Chrome et Edge, et la parole passe par le service du navigateur.
4. **Lecture des feuilles de notes par Claude** : les noms et les notes de la feuille sont transmis à un service externe. À mentionner dans la politique de confidentialité avant usage réel.
5. **Entrées et sorties sans matériel de badgeage** : carte QR lue par un lecteur ou une caméra, ou saisie manuelle.
6. **Les enseignants ne voient plus le tableau de bord de l'école** (qui contient les finances) : ils ont le leur.
7. **Un élève peut avoir son propre compte**, créé par le secrétariat : il lit son dossier, sans les frais de scolarité, et ne peut rien modifier.
8. **La fiche d'un élève ne montre plus ses factures aux enseignants** : elles restent visibles du secrétariat, de la direction et de la comptabilité.
9. **Les notifications push ne transportent aucun contenu** : l'appareil affiche « nouvelle notification », le détail se lit dans l'application.

## 6. Reste à faire

- **Notifications push** : générer les clés une fois (`node scripts/generate-vapid.js`), les mettre dans la configuration de production, puis essayer sur un téléphone.
- **Cloisonnement PostgreSQL (RLS)** : décision du 4 octobre 2026 : ne pas le faire maintenant. Le cloisonnement reste assuré par l'application et vérifié par les tests ; le RLS sera un chantier à part, avec un essai complet avant la production.
- Permissions fines par utilisateur.
- Brouillon de pré-inscription conservé sur le serveur ; brouillon de vitrine étendu aux photos et témoignages.
- Pagination côté écran des listes parents et personnel (l'API sait paginer, les écrans chargent encore la liste entière) ; pagination des autres listes ; montants en décimal exact.
- Tests automatiques dans un navigateur pour les nouveaux écrans, et essai sur téléphone.
- Du premier chantier (`docs/AMELIORATIONS.md`) : cantine, bibliothèque, infirmerie, export DREN, traduction complète en anglais.
