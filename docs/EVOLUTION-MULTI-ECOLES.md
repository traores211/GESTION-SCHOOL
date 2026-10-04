# Évolution multi-écoles : audit, architecture et état des lots

Réponse au cahier des charges `docs/AMELIORATIONS2.md`. Mis à jour le 4 octobre 2026, branche `feature/robustness`.

« Fait » signifie : codé et vérifié par des tests automatiques. Les écrans ajoutés pendant ce chantier sont vérifiés à la compilation et au lint, **pas dans un navigateur** (voir « Ce qui n'est pas vérifié »).

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
| 2. Utilisateurs et rôles | Fait pour l'essentiel | Périmètre enseignant, rattachements par école. Surveillant, éducateur, sécurité sont des **catégories du dossier du personnel**, pas des rôles de connexion. La table `Permission` reste inutilisée |
| 3. Élèves | Fait | Fiche étendue (origine, régime, scolarité antérieure, date d'entrée), historique des classes. Pas de photo d'identité dans la fiche (à déposer comme document) |
| 4. Parents | Fait | Plusieurs enfants, lien par enfant (qualité, responsable légal, contact d'urgence, autorisé à récupérer l'enfant), fiche étendue, pièce d'identité chiffrée |
| 5. Personnel | Fait | Dossier (catégorie, contrat, diplômes, contact d'urgence, compte bancaire chiffré), rattachement à plusieurs établissements |
| 6. Classes | Fait | Série, salle, archivage, déplacement d'un élève avec historique |
| 7. Inscriptions | Partiel | Le parcours d'admission existant est conservé (10 étapes, pièces, suivi public). Réinscription individuelle par l'API, **sans écran**. Pas d'état « brouillon » côté famille |
| 8. Passage en classe supérieure | Fait | Aperçu, proposition, décision, plan, exécution confirmée, création des classes manquantes, relance sans effet |
| 9. Présences | Fait | Appel existant, plus dictée vocale |
| 10. Entrées et sorties | Fait | Carte QR, saisie manuelle, retards, sorties anticipées, personnes autorisées, notification des familles |
| 11. Notes | Fait | Saisie manuelle et import existants, plus dictée et lecture d'une feuille |
| 12. Appel vocal | Fait | Reconnaissance vocale du navigateur (Chrome, Edge), champ de texte en secours |
| 13. OCR | Fait côté application | Lecture par Claude si `ANTHROPIC_API_KEY` est renseignée. **Aucun appel réel au service n'a été fait pendant les tests** |
| 14. Import de fichiers | Fait | Existant ; un enseignant n'importe plus que pour ses classes et ses matières |
| 15. Vitrine | Fait | Brouillon, aperçu, publication, contenus supplémentaires, formulaire de contact. Le brouillon ne couvre pas les photos, chiffres clés, partenaires et témoignages, publiés dès leur enregistrement. Pas de favicon par école |
| 16. Notifications | Partiel | Interne, e-mail, SMS et WhatsApp. Nouveaux événements : arrivée, sortie, nouvelle note, document disponible. **Pas de notification push**, pas de préférences par canal |
| 17. Documents | Fait | Catégorie, version, archive, visibilité, suppression contrôlée, partage avec la famille |
| 18. Tableaux de bord | Fait | École (existant), enseignant, plateforme, parent (portail). Pas de portail élève |
| 19. Audit | Fait | Existant : auteur, action, objet, anciennes et nouvelles valeurs, adresse IP, résultat |
| 20. Tests | Fait | Voir ci-dessous |

## 4. Vérifications

- 240 tests unitaires côté API, 30 côté web.
- 26 scénarios de bout en bout sur l'API, 571 vérifications, tous exécutés ensemble après le dernier lot.
- Les migrations (7 nouvelles) sont appliquées sur la base de développement et comparées au schéma : aucune différence.
- Les 2 575 liens parent-enfant existants ont été repris avec leur qualité.

### Ce qui n'est pas vérifié

- **Aucun des écrans ajoutés n'a été ouvert dans un navigateur** : le navigateur de test n'a pas pu être installé dans le conteneur. Les écrans concernés : Établissements, dossier du personnel, fiche élève enrichie, documents, années et passage, entrées et sorties, saisie rapide, brouillon de vitrine, tableau de bord enseignant, nouveaux onglets du portail parents.
- La dictée vocale et la lecture de carte par caméra dépendent du navigateur et du matériel : elles n'ont pas été essayées.
- La lecture d'une feuille de notes par le service externe n'a pas été appelée en vrai ; seul le traitement de sa réponse est testé.
- L'intégration continue n'a jamais tourné : la branche n'est pas poussée.

## 5. Choix faits sans validation, à confirmer

1. **Un compte travaille dans un établissement à la fois**, pour toutes ses sessions (pas un établissement par onglet).
2. **La personne qui inscrit son école devient administrateur de groupe**, pour pouvoir ajouter d'autres établissements.
3. **Reconnaissance vocale par le navigateur** : gratuite, mais limitée à Chrome et Edge, et la parole passe par le service du navigateur.
4. **Lecture des feuilles de notes par Claude** : les noms et les notes de la feuille sont transmis à un service externe. À mentionner dans la politique de confidentialité avant usage réel.
5. **Entrées et sorties sans matériel de badgeage** : carte QR lue par un lecteur ou une caméra, ou saisie manuelle.
6. **Les enseignants ne voient plus le tableau de bord de l'école** (qui contient les finances) : ils ont le leur.

## 6. Reste à faire

- Écran de réinscription et état « brouillon » d'une pré-inscription côté famille.
- Rôles de connexion pour surveillants et éducateurs ; permissions fines par utilisateur.
- Notifications push et préférences par canal.
- Portail élève.
- Cloisonnement PostgreSQL (RLS), pagination de toutes les listes, montants en décimal exact.
- Essai de tous les nouveaux écrans dans un navigateur, puis sur téléphone.
- Du premier chantier (`docs/AMELIORATIONS.md`) : cantine, bibliothèque, infirmerie, export DREN, traduction complète en anglais.
