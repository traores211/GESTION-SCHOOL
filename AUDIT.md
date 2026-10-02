# AUDIT UI — School ERP (branche `redesign/ui-v2`)

> Phase 1 : constat seul, **aucun fichier applicatif modifié**.
> Date : 2026-09-29 · Outil : skill Impeccable v4.4.0 (moteur 0.1.7), mode **Operate** (back-office).
>
> ⚠️ **Critique en mode dégradé (un seul contexte)** : le protocole Impeccable prévoit deux sous-agents indépendants (revue design / détecteur). Je les ai exécutés l'un après l'autre dans la même session, car vous n'aviez pas demandé de sous-agents. La revue design a été rédigée avant la lecture des résultats du détecteur.

---

## 0. Points à trancher avant la Phase 2 (bloquants)

Le brief collé est un gabarit générique. Il ne correspond pas à ce dépôt sur plusieurs points :

| Brief | Réalité du dépôt | Impact |
|---|---|---|
| « outils internes télécom / back-office », agents et managers | **ERP scolaire** (Côte d'Ivoire) : direction, secrétariat, enseignants, comptables, parents | Change les références marché et les personas |
| Charte **Orange** (#FF7900 en accent seulement) | Identité actuelle **vert CI #00954A + orange #F77F00**, avec une bande drapeau orange-blanc-vert | Il faut choisir : garder l'identité ivoirienne ou passer à Orange |
| Maquettes dans `./design/claude-design/` « qui font foi » | **Le dossier n'existe pas** | La Phase 2 n'a aucune source visuelle |
| Auth Keycloak/LDAP | JWT maison + OpenLDAP (aucun Keycloak) | Aucun impact UI (rien à toucher) |
| `<NOM_APP>`, stack | Next.js 15 (App Router) + NestJS + Prisma/PostgreSQL | — |

**Git :** `redesign/ui-v2` a été créée depuis `feat/timetable-ux-overhaul`, qui contenait **87 fichiers modifiés ou non suivis, non commités** (travail sur les emplois du temps, sécurité backend, composants `ui/`…). Ce travail suit la nouvelle branche. Je ne l'ai **pas commité** : le commit de cette phase ne contient que `AUDIT.md` et le skill installé. Il faut décider où ce travail doit vivre avant de commencer la Phase 3.

---

## 1. Inventaire

### Écrans (22 routes)

| Zone | Route | Usage estimé | Remarques |
|---|---|---|---|
| Accès | `/login` | quotidien | Panneau vert en dégradé + formulaire ; comptes de démo cliquables |
| Pilotage | `/dashboard` | quotidien | 674 l. ; raccourcis, panneau « Aujourd'hui », filtres, alertes, KPI, graphiques |
| | `/timetable`, `/timetable/manage`, `/timetable/import` | quotidien / ponctuel | Grille hebdomadaire ; l'import fait **980 l.** avec 43 styles inline |
| Scolarité | `/students`, `/students/[id]` | quotidien | Tableau trié et paginé, fiche élève |
| | `/classes`, `/classes/[id]` | hebdo | |
| | `/attendance` | quotidien | Appel avec segments Présent / Absent / Retard / Justifiée, barre d'enregistrement collante |
| | `/grades` | hebdo | Saisie des notes, bulletins PDF |
| | `/admissions`, `/parents` | hebdo | |
| Gestion | `/staff`, `/billing`, `/payroll`, `/transport` | hebdo / mensuel | |
| | `/announcements` | ponctuel | 542 l. ; annonces + éditeur de la vitrine publique |
| Famille | `/portal` | parents | |
| Public | `/`, `/ecole/[code]`, `/ecole/[code]/inscription` | visiteurs | Mode **Persuade**, hors périmètre back-office (à confirmer) |

### Composants existants

- **Shell** (`components/Shell.tsx`) : barre latérale groupée par rôle, en-tête, menu du compte, lien d'évitement, cloche de notifications.
- **Kit UI** (`components/ui/index.tsx`) : `PageHeader`, `Breadcrumbs`, `EmptyState` (vide / erreur), `TableSkeleton`, `CardSkeleton`, `SearchInput` (avec délai), `SortHeader` (`aria-sort`), `Pagination`, `Avatar`, `FormError`, `Stagger`.
- **Modal**, **Feedback** (toasts et `confirm` asynchrone maison, sans `window.confirm`).
- **Hook** `useTable` (tri, filtre, pagination côté client), utilisé dans 8 écrans.
- **Tableau de bord** : `charts.tsx` (Recharts), `ui.tsx`, `TodayPanel`.
- **Emploi du temps** : `TimetableGrid`, `SessionModal`.
- **Illustrations** : `Schoolkids.tsx` (421 l. de SVG, 100 couleurs hex).

---

## 2. Audit technique (Impeccable `audit`)

### Score de santé

| # | Dimension | Score | Constat principal |
|---|---|---|---|
| 1 | Accessibilité | 2/4 | Le **bouton primaire (blanc sur #F77F00) a un contraste de 2,63:1**. Il échoue au niveau AA, sur toutes les pages. |
| 2 | Performance | 3/4 | Globalement sain ; transition sur `width` (barre de progression) ; le conteneur sert `next dev` |
| 3 | Responsive | 2/4 | 4 points de rupture et un tiroir mobile existent ; cibles tactiles de 28 à 38 px (< 44) ; montants et références qui passent à la ligne |
| 4 | Thème | 2/4 | Les tokens existent, mais il n'y a **aucun mode sombre**, 321 `style={{}}` inline et 74 `fontSize` codés en dur |
| 5 | Intégrité | 2/4 | Plusieurs dérives vérifiées (voir ci-dessous) |
| **Total** | | **11/20** | **Acceptable : travail significatif à prévoir** |

### Verdict d'intégrité : **échec partiel**
Le socle est pensé comme un système : tokens centralisés, commentaires « components only reference tokens », kit d'états partagé. L'usage ne suit pas : 321 styles inline, 10 tailles de police réellement rendues (10,5 à 22 px), 7 rayons différents (7, 9, 10, 12, 14 px, 50 %, 999 px) et des couleurs hex codées en dur dans `timetable/manage` et `charts.tsx`.

### Détecteur (`impeccable detect`) : 4 constats, tous confirmés

| Règle | Fichier | Verdict |
|---|---|---|
| Bande d'accent de 3 px sur carte arrondie (`.kpi-card::after`) | `globals.css:500` | ✅ Réel : c'est la bordure latérale colorée des KPI de facturation, un motif « gadget » |
| `border-left: 4px` sur carte arrondie | `timetable.css:103` | ⚠️ Défendable : code couleur par matière dans la grille. À garder, mais sans rayon côté bande |
| `border-top: 4px` sur carte arrondie | `showcase.css:100` | ✅ Réel (vitrine publique) |
| `transition: width` | `globals.css:1320` | ✅ Réel : utiliser `transform: scaleX` |

### Constats détaillés

**P1 : à corriger avant mise en production**

1. **[P1] Contraste du bouton primaire à 2,63:1.** `.btn-primary`, fond `#F77F00`, texte blanc. Le même problème touche l'orange Orange #FF7900 (2,63:1), qui ne peut donc **jamais porter de texte blanc**. En revanche, le noir sur #FF7900 atteint 7,99:1. Ce point confirme la consigne du brief « orange en accent uniquement ». → `colorize`, `audit`
2. **[P1] `--text-subtle` (#7D8A84) à 3,34:1 sur le fond** et 3,6:1 sur blanc. Ce token sert aux textes secondaires, au-dessous du seuil de 4,5:1. → `colorize`
3. **[P1] Pas de mode sombre.** Aucune règle `prefers-color-scheme` ni `data-theme`. Le brief l'exige. → `extract`, `colorize`
4. **[P1] La barre « Enregistrer les notes » masque la dernière ligne.** Sur `/grades` (et `/attendance`), la barre collante recouvre l'élève suivant (« Kra Odette » à moitié caché à 1280×537). Il manque un `padding-bottom` réservé. → `layout`
5. **[P1] L'image frontend tourne en `next dev`** (Dockerfile `CMD npm run dev`, `NODE_ENV=development`). On y voit le badge « N » de Next, qui recouvre le menu Personnel. C'est lent, non optimisé et n'est pas un livrable. Phase 5 : build de production (`next build` + `next start`). → hors Impeccable (DevOps)
6. **[P1] L'URL de l'API est figée au build.** `NEXT_PUBLIC_API_URL` est incrusté dans le bundle à la compilation, avec un repli `http://localhost:4000/api` dans `lib/api.ts:3` **et** dans `next.config.js`. Une même image ne peut donc pas être déployée ailleurs que sur localhost. Correctif prévu en Phase 4 : configuration **à l'exécution** (route `/runtime-config` ou `window.__ENV` injecté par le layout serveur), sans nginx.

**P2**

7. **[P2] Cibles tactiles sous 44 px.** Boutons de 38 px, `btn-sm` de 32 px, `btn-icon.btn-sm` de 30 px, avatar du menu de 28 px. → `adapt`
8. **[P2] Montants et identifiants qui passent à la ligne.** « 8 100 000 / FCFA » sur 2 lignes dans les KPI, « INV-2026- / 00015 » coupé, « 450 000 / FCFA » sur 3 lignes dans la colonne Reste dû. Il manque `white-space: nowrap`, la devise en unité secondaire et des largeurs de colonnes. → `typeset`, `layout`
9. **[P2] Mouvement réduit mal géré.** Tout est coupé globalement à 1 ms (`globals.css:1409`), ce qu'Impeccable signale explicitement : le changement d'état perd sa lisibilité. Il faudrait conserver les fondus d'opacité et ne retirer que les translations. → `animate`
10. **[P2] 321 `style={{}}` inline**, concentrés dans `timetable/import` (43), `announcements` (32), `transport` (19), `timetable` (17). Ils court-circuitent les tokens et rendent le mode sombre impossible sans les reprendre. → `extract`
11. **[P2] Pas de `lint` fonctionnel.** `npm run lint` appelle `eslint .`, mais le frontend n'a **aucune configuration ESLint**. Le critère de la Phase 4 est donc aujourd'hui inatteignable ; il faudra ajouter une config minimale (`next/core-web-vitals`).

**P3**

12. Titre de page en double : « Élèves » dans l'en-tête **et** en H1 juste dessous.
13. `Shell` rend un écran vide (pas de squelette) pendant la vérification du jeton.
14. Échelle typographique à 10 tailles et non modulaire (11 / 11,5 / 12,5 / 13 / 13,5 / 14 / 15 / 16 / 22 / 28 px).

### Points positifs à conserver
- Kit d'états cohérent : `TableSkeleton` a la forme du tableau, `EmptyState` gère le vide et l'erreur avec `role="alert"`, `FormError`.
- Tableaux accessibles : `SortHeader` avec `aria-sort`, pagination étiquetée, recherche avec délai et bouton d'effacement.
- Shell : lien d'évitement, `aria-current`, fermeture par Échap, focus visible (anneau vert) ; menu filtré par rôle et aligné sur les groupes de rôles de l'API.
- Confirmations destructives via une modale maison (9 écrans), jamais `window.confirm`.
- Messages d'erreur en français clair (`errorMessage`), redirection propre à l'expiration de session.
- Présence : « tous présents par défaut, ne cochez que les absences ». C'est un excellent choix produit.

---

## 3. Critique design (Impeccable `critique`)

### Spécificité du design : **générique, avec une touche locale décorative**
La structure (barre latérale sombre, cartes KPI, tableaux) est interchangeable avec n'importe quel SaaS de 2022. Les seuls signes d'identité sont décoratifs : le drapeau en bande de 3 px en haut, le dégradé vert de la sidebar, la pastille orange en dégradé du logo. La vraie singularité du produit est ailleurs : FCFA, Mobile Money (Orange / MTN / Moov / Wave), trimestres, matricules, appel. Or ces éléments sont traités comme du texte ordinaire au lieu de structurer l'interface.

### Heuristiques de Nielsen

| # | Heuristique | Score | Constat |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Squelettes, « Mis à jour à 22:13 », compteur « 0/6 note(s) saisie(s) ». Il manque le squelette du shell |
| 2 | Correspondance avec le réel | 3 | Vocabulaire scolaire juste ; « échéance dépassée » sans montant associé |
| 3 | Contrôle et liberté | 3 | Annuler, Échap, effacement de recherche ; pas d'annulation après enregistrement |
| 4 | Cohérence et standards | 2 | 10 tailles, 7 rayons, orange tantôt accent tantôt aplat, vert tantôt marque tantôt succès (bouton « Encaisser » vert à côté de « Nouvelle facture » orange) |
| 5 | Prévention des erreurs | 3 | Confirmations, sélecteurs contraints, présents par défaut |
| 6 | Reconnaissance plutôt que rappel | 3 | Navigation libellée et groupée |
| 7 | Flexibilité et efficacité | 1 | **Aucun raccourci clavier, aucune palette de commandes, aucune action groupée**, aucun filtre enregistré. C'est l'écart principal pour un usage quotidien intensif |
| 8 | Esthétique et minimalisme | 2 | Titre en double, bande drapeau, dégradés, bordures latérales des KPI, 3 alertes empilées sur le tableau de bord |
| 9 | Récupération après erreur | 3 | Messages clairs, `FormError` en ligne |
| 10 | Aide et documentation | 1 | Aucune aide contextuelle, aucune infobulle sur les KPI |
| **Total** | | **24/40** | **Acceptable** |

Charge cognitive : 3 échecs sur 8 (choix minimaux : 6 raccourcis + 4 filtres + alertes sur le tableau de bord ; hiérarchie visuelle ; bruit de fond). Charge **modérée**.

### Problèmes prioritaires
1. **[P1] L'orange est utilisé en aplat pour l'action primaire**, ce qui est contraire à la cible et illisible (2,63:1). Il faut une action primaire neutre et sombre (encre ou vert profond) et réserver l'orange à l'indicateur actif, au focus et aux données clés. → `colorize`
2. **[P1] Aucun accélérateur pour les usagers quotidiens** : secrétaire et comptable font des dizaines d'opérations par jour. Il faut une palette `Ctrl+K`, `/` pour chercher, `N` pour nouveau, la sélection multiple avec actions groupées (relances, export) et des filtres persistants dans l'URL. → `shape`, `harden`
3. **[P2] Les données financières sont mal typographiées** : pas de chiffres tabulaires alignés à droite, devise sur la même taille que le montant, retours à la ligne. → `typeset`
4. **[P2] Décor sans fonction** : bande drapeau, dégradés, bordures latérales, titre en double. → `quieter`, `distill`
5. **[P2] Pas de mode sombre ni de densité réglable** (compact / confortable). → `colorize`, `layout`

### Personas
- **Alex (secrétaire, usage intensif)** : il faut 3 clics et la souris pour encaisser ; pas de `Ctrl+K` ; la recherche n'est pas focalisable au clavier depuis n'importe où ; pas de sélection multiple pour relancer les 13 factures en retard.
- **Sam (accessibilité)** : bouton primaire à 2,63:1 et textes secondaires à 3,34:1 ; le statut n'est heureusement pas porté que par la couleur (pastille + libellé ✓).
- **Casey (parent sur mobile)** : cibles de 30 à 38 px ; montants coupés sur 3 lignes dans les colonnes étroites.

---

## 4. Comparaison avec le marché

| Référence | Ce qu'elle fait mieux | Ce qui nous place en dessous |
|---|---|---|
| **Linear** | Palette `Ctrl+K`, raccourcis partout, densité, un seul accent, mode sombre natif, transitions de 100 à 150 ms | Aucun raccourci ; accent orange partout en aplat ; pas de sombre |
| **Atlassian (Jira / Design System)** | Tokens sémantiques complets (`color.text.subtle`, `elevation.surface.raised`), thèmes clair et sombre générés depuis un même jeu, tableaux denses avec colonnes configurables, actions groupées, filtres enregistrés | Tokens bruts plutôt que sémantiques, 321 styles inline ; pas de colonnes configurables ni de filtres enregistrés |
| **ServiceNow (Next Experience) / Pronote, Ecole Directe (métier)** | Listes métier : vues enregistrées, export, édition en ligne, historique d'activité par dossier. Pronote : saisie des notes au clavier (Entrée ou flèches pour passer à l'élève suivant) | Saisie des notes à la souris champ par champ ; pas d'historique sur la fiche élève ; export limité |

**En une phrase :** la base technique est au niveau (squelettes, états, `aria-sort`). L'écart porte sur l'**efficacité des usagers quotidiens** (clavier, actions groupées, vues enregistrées), la **rigueur du système** (échelle typographique, rayons, zéro style inline, sombre) et la **retenue visuelle** (un seul accent, pas de décor).

---

## 5. Plan recommandé (à valider)

1. **[P1]** `init` : écrire PRODUCT.md (utilisateurs réels, ton, identité CI ou Orange)
2. **[P1]** `extract` : tokens sémantiques uniques, clair et sombre, échelles de typo, espacements et rayons ; purge des 321 styles inline
3. **[P1]** `colorize` : action primaire neutre, orange en accent seulement, textes secondaires ≥ 4,5:1
4. **[P1]** `layout` : shell (titre unique, squelette, barre collante non masquante), densité
5. **[P1]** `harden` + `shape` : `Ctrl+K`, raccourcis, sélection multiple, filtres dans l'URL, saisie des notes au clavier
6. **[P2]** `typeset` : chiffres tabulaires, montants et devise, échelle de 6 tailles
7. **[P2]** `adapt` : cibles de 44 px au tactile, tableaux en cartes sous 640 px
8. **[P2]** `animate` : alternative réfléchie à `prefers-reduced-motion`
9. **[P2]** `quieter` : retrait de la bande drapeau, des dégradés et des bordures latérales
10. `polish` : passe finale

Hors Impeccable : correctif de l'URL API à l'exécution, config ESLint, image frontend de production (Phases 4 et 5).

---

### Notes d'exécution
- Contexte Impeccable : chargé (`NO_PRODUCT_MD`, `EXISTING_VISUAL_SYSTEM`).
- Détecteur CLI : exécuté sur `frontend/src`, 4 constats.
- Navigateur : inspection réelle de 7 écrans à 1280 et 1440 px avec le compte de démo du seed. **Le mobile n'a pas pu être rendu** (la fenêtre Chrome ne descend pas sous 1280 px) ; le responsive a été évalué depuis le CSS.
- Superposition du détecteur dans la page : non injectée (serveur live non lancé).
- Conteneurs : `docker compose start` du projet (ils s'étaient arrêtés d'eux-mêmes avec le code 255) ; aucune suppression ni aucun rebuild.
