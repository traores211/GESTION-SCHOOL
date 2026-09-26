# Audit UX/UI et accessibilité — GESTION SCHOOL (Phase 0)

> Date : 2026-09-26 · Périmètre : 20 routes Next.js, `Shell`, `NotificationBell`, `globals.css`.
> Méthode : lecture du code de chaque écran + mesures par `grep` (reproductibles). Les tests clavier / lecteur d'écran / mobile réels seront exécutés sur l'application déployée en Phase 14 (Docker n'était pas démarré sur le poste au moment de l'audit).

## 1. Mesures globales

| Indicateur | Mesure | Cible |
|---|---|---|
| Styles inline `style={{…}}` | **216** | < 10 (tout passe par le design system) |
| Attributs ARIA / `role=` | **2** | chaque composant interactif non natif en porte |
| `<label>` associés (`htmlFor`) | **2 / 65** | 100 % |
| Modales avec gestion d'Échap / piège de focus | **0 / 11** | 100 % |
| Écrans avec état de chargement | 3 / 20 | 100 % (skeleton) |
| Écrans avec état vide explicite | partiel | 100 % avec action proposée |
| Pagination de tableaux | 0 | toute liste > 50 lignes |
| Navigation < 860 px | **aucune** (sidebar masquée, rien ne la remplace) | navigation mobile complète |
| `lang` du document | `en` pour une UI française | `fr` (et langue du tenant) |
| Mode sombre | non | oui, via tokens |
| `prefers-reduced-motion` | non géré | respecté |
| Branding | « School ERP / Côte d'Ivoire » + drapeau codé en dur | nom, logo, couleurs du tenant |

## 2. Problèmes transverses

1. **Mobile inutilisable (bloquant)** — `@media (max-width: 860px) { .sidebar { display: none; } }` sans menu de remplacement : sur smartphone, un enseignant ne peut pas atteindre l'appel ni les notes. C'est pourtant le parcours mobile principal.
2. **Pas de design system** — quelques tokens CSS existent (bonne base), mais 216 styles inline dupliquent espacements et couleurs ; aucun composant partagé (Button, Field, Table, Modal, EmptyState…). Chaque page réinvente ses modales et ses tableaux.
3. **Identité visuelle figée** — palette « drapeau ivoirien » (orange/vert) et bandeau tricolore codés en dur : incompatible avec la marque blanche par école. Contrastes calculés (WCAG 2.x) : texte blanc sur orange `#f77f00` des boutons primaires **≈ 2,6:1 → échoue AA** ; blanc sur vert `#00954a` (boutons secondaires, lien actif) **≈ 3,9:1 → échoue AA en texte courant** ; seul le vert foncé `#00753a` des liens passe (≈ 5,8:1).
4. **Icônes emoji partout** — chaque entrée de menu porte un emoji (🎓📊💰…), rendu variable selon l'OS, lu à voix haute par les lecteurs d'écran (« bonnet de diplômé… »). Contraire à la règle « une icône doit avoir une fonction claire ».
5. **États incomplets** — beaucoup d'écrans affichent un tableau vide pendant le chargement (impossible de distinguer « chargement », « vide » et « erreur »). Les erreurs sont des `<p className="text-danger">` sans `role="alert"`.
6. **Formulaires** — 63 labels non reliés à leur champ (clic sur le label inopérant, champ sans nom accessible) ; aucune validation en ligne ; pas d'`autocomplete` ; erreurs serveur concaténées en une chaîne.
7. **Accessibilité clavier** — pas de style `:focus-visible` pour boutons et liens ; modales sans `role="dialog"`, `aria-modal`, piège de focus, ni fermeture Échap ; `NotificationBell` est un menu déroulant sans sémantique.
8. **Garde d'authentification côté client** — `Shell` rend `null` tant que le token n'est pas lu : flash blanc à chaque navigation, et contenu protégé seulement par du JavaScript.
9. **Vitrine publique rendue côté client** — `/ecole/[code]` est `"use client"` : aucun contenu ni métadonnée pour Google / WhatsApp / Facebook (pas de SEO, pas d'aperçu OpenGraph) — alors que c'est l'outil d'acquisition de l'école.
10. **Tableaux** — pas de tri, pas de pagination, pas d'adaptation mobile (débordement horizontal), actions noyées dans les lignes.

## 3. Audit par écran

| Écran | Info clé attendue | Action principale | Problèmes constatés | Priorité |
|---|---|---|---|---|
| `/login` | marque de l'école | se connecter | branding générique ; pas de « mot de passe oublié » ; pas d'`autocomplete="username/current-password"` ; erreur non annoncée ; fond dégradé tricolore peu lisible | P1 |
| `/` (accueil) | — | aller au login / dashboard | page intermédiaire sans valeur | P3 |
| `/dashboard` | ce qui demande une action aujourd'hui | accéder aux tâches | aucun état de chargement ; KPI statiques sans tendance ni lien ; les finances sont montrées à l'enseignant ; pas de vue par rôle | P1 |
| `/students` | trouver un élève | inscrire / ouvrir une fiche | recherche uniquement par bouton (pas de recherche instantanée) ; pas de filtre classe/statut dans l'UI ; pas de pagination ; modale non accessible | P1 |
| `/students/[id]` | synthèse 360° | modifier, voir impayés | information dense sans hiérarchie ; onglets non accessibles (div cliquables) | P2 |
| `/parents` | lien parent ↔ enfants | créer un parent | multi-sélection d'élèves peu utilisable à volume | P2 |
| `/staff` | personnel et rôles | créer un compte | mot de passe temporaire affiché une fois sans copie ni envoi | P2 |
| `/classes`, `/classes/[id]` | effectifs, titulaire | créer, inscrire | appel à `/staff` qui renvoie les salaires (voir SEC-02) ; inscription élève par liste déroulante de toute l'école | P1 |
| `/admissions` | pipeline des candidatures | faire avancer un dossier | 10 statuts dans une liste déroulante : un tableau kanban / étapes serait plus lisible | P2 |
| `/attendance` | liste de la classe | enregistrer l'appel | parcours mobile n°1 mais inutilisable sur mobile ; pas de « tous présents » ; pas de sauvegarde auto | **P0** |
| `/grades` | grille de saisie | saisir les notes | saisie mobile difficile ; aucune protection contre la perte de saisie ; bulletin en lien brut vers le PDF | P1 |
| `/billing` | impayés | encaisser | pas de filtre « en retard » ; formulaire de paiement sans rappel du reste à payer ; aucune confirmation avant encaissement | P1 |
| `/payroll` | état de la paie du mois | générer / valider / payer | actions irréversibles (payer) sans confirmation | P1 |
| `/transport` | circuits et affectations | abonner un élève | bouton « ping GPS » de démonstration visible en production | P3 |
| `/announcements` | annonces publiées | publier | pas d'aperçu de la vitrine | P2 |
| `/portal` (parent) | situation de chaque enfant | payer, voir notes | pas d'état de chargement ; pas de paiement en ligne ; pas pensé mobile alors que les parents sont à 90 % sur smartphone | **P0** |
| `/ecole/[code]` | présentation de l'école | se préinscrire | rendu client (pas de SEO) ; aucune personnalisation (logo, couleurs, sections, galerie) | P1 |
| `/ecole/[code]/inscription` | formulaire court | envoyer | pas de protection anti-spam ; pas d'accusé de réception par email/SMS | P1 |
| `NotificationBell` | non lues | ouvrir | polling, sémantique de menu absente | P2 |

## 4. Recommandations (appliquées par le skill `uix-pro`)

- Construire le design system **avant** de toucher aux écrans (voir `docs/ux/design-system.md`) : tokens sémantiques thémables par tenant, composants accessibles par construction.
- Refaire d'abord les parcours mobiles critiques : appel, saisie de notes, portail parent, connexion.
- Navigation mobile : barre inférieure (4 entrées selon le rôle) + tiroir pour le reste.
- Tableau de bord par rôle orienté « tâches du jour » plutôt que KPI génériques.
- Vitrine en rendu serveur (SSR/ISR) avec métadonnées OpenGraph par école.
- Retirer les emojis du menu ; icônes SVG sobres uniquement là où elles aident à reconnaître une entrée (navigation), jamais par défaut devant les boutons.
