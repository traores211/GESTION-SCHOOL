---
name: School ERP
description: Le carnet à souches. Papier blanc, encre presque noire et les encres du drapeau ivoirien pour la gestion scolaire.
colors:
  clay: "#f77f00"
  clay-ink: "#a85400"
  clay-strong: "#8a4500"
  clay-wash: "#fbe6cc"
  clay-line: "#f2c38c"
  flag-green: "#009e60"
  olive: "#00754a"
  olive-wash: "#d9eedf"
  ochre: "#8a5a00"
  ochre-mark: "#d39a2a"
  ochre-wash: "#f5e7c8"
  crimson: "#a2302a"
  crimson-strong: "#84231e"
  crimson-wash: "#f6dfda"
  slate: "#3d5a80"
  slate-wash: "#dfe6ef"
  paper: "#ffffff"
  paper-raised: "#ffffff"
  paper-sunken: "#f6f5f2"
  paper-deep: "#ecebe6"
  surface-muted: "#fafaf8"
  rule: "#e5e3dd"
  rule-strong: "#cdcac2"
  ink: "#1f1d1a"
  ink-2: "#48433c"
  ink-3: "#6b645a"
typography:
  display:
    fontFamily: "Source Serif 4, Source Serif Pro, Georgia, serif"
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4, Source Serif Pro, Georgia, serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  section:
    fontFamily: "Source Serif 4, Source Serif Pro, Georgia, serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"cv11\", \"ss01\""
  label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  figure:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\""
  stamp:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.1em"
rounded:
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-raised}"
    rounded: "{rounded.md}"
    padding: "8px 15px"
    height: "40px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-secondary:
    backgroundColor: "{colors.clay-ink}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 15px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.clay-strong}"
  button-outline:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 15px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.paper-sunken}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "8px 15px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.crimson}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 15px"
    height: "40px"
  input:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.paper-raised}"
    rounded: "{rounded.lg}"
    padding: "20px"
  stub-margin:
    backgroundColor: "{colors.paper-sunken}"
    textColor: "{colors.ink-2}"
    width: "72px"
    padding: "8px 12px"
  badge:
    backgroundColor: "transparent"
    rounded: "{rounded.sm}"
    padding: "1px 7px"
    typography: "{typography.stamp}"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.clay-ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    typography: "{typography.stamp}"
  stamp-settled:
    textColor: "{colors.olive}"
  sidebar-link-active:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
    height: "36px"
  pagination-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-raised}"
    rounded: "{rounded.md}"
    size: "32px"
---

# Design System: School ERP

## Overview

**Creative North Star: "Le carnet à souches"**

Chaque enregistrement de l'école se lit comme la souche d'un carnet de reçus. Son numéro (matricule, référence de facture, heure de cours) tient dans une marge en chiffres tabulaires ; une perforation en pointillés le sépare du contenu ; l'état final se pose comme un coup de tampon. Le papier est blanc, l'encre presque noire, et les seules couleurs fortes sont les encres du drapeau ivoirien : l'orange pour les tampons et les marques, le vert pour ce qui est réglé.

Le système sert d'abord le personnel qui traite des dizaines d'opérations par jour. La densité est lisible plutôt que décorative : des registres réglés de filets d'un pixel, des chiffres alignés, une seule action en encre pleine par écran. Le calme vient de la retenue (un seul accent, aucune ombre sur les panneaux, aucun dégradé) et des titres en serif qui donnent à chaque page l'allure d'un document tenu avec soin.

Le mode sombre n'est pas une inversion : c'est un papier carbone, brun-noir chaud, encre crème, avec des encres éclaircies pour garder le contraste. La grille SaaS de cartes blanches ombrées et de badges pastel est explicitement refusée, comme les dégradés de l'ancienne interface. Seule trace directe du drapeau : une bande tricolore de 4px en haut de chaque page.

**Key Characteristics:**
- Papier blanc et encre presque noire ; orange et vert du drapeau comme seules encres de couleur.
- Panneaux séparés par des filets d'un pixel, jamais par des ombres.
- Numéros en marge, en chiffres tabulaires, derrière une perforation en pointillés.
- États finaux tamponnés : cartouche en capitales, double filet, inclinaison de −2°.
- Serif pour les titres, sans de travail pour l'interface.
- Grille de 4 px, rayons de 3 à 8 px.

## Colors

Une palette de papier et d'encre, où l'orange et le vert du drapeau ivoirien sont rares et donc lisibles.

### Primary
- **Orange tampon** (clay): l'orange exact du drapeau. Il marque sans parler : icône de l'onglet actif dans la navigation, soulignement de l'onglet sélectionné, tri actif, case cochée, barre de progression, chiffres d'étapes sur la vitrine, coin de la marque. Il ne porte jamais de texte, ni ne sert de fond sous un texte blanc (2,6:1).
- **Orange encre** (clay-ink): la variante foncée pour tout texte orange : liens, badges « à venir », tampons par défaut, bouton secondaire (encaisser, valider) sous texte blanc.
- **Orange brûlé** (clay-strong): survol du bouton secondaire.
- **Lavis orange** (clay-wash) et **filet orange** (clay-line): fond de sélection, étape franchie, zone de dépôt active.

### Secondary
- **Vert drapeau** (flag-green): le vert exact du drapeau, réservé aux marques graphiques (les lignes du logo). Jamais en texte.
- **Vert réglé** (olive): le vert du drapeau assombri pour le texte (AA). Il dit « réglé » : tampon PAYÉ, CONFIRMÉ, variation positive, alerte de succès.
- **Lavis vert** (olive-wash): fond des messages de succès.

### Tertiary
Couleurs sémantiques, toujours accompagnées d'une icône ou d'un libellé.
- **Ocre** (ochre) / **ocre de marque** (ochre-mark) / **lavis ocre** (ochre-wash): avertissement ; l'ocre de marque remplit les jauges en alerte, jamais le texte.
- **Rouge registre** (crimson) / **rouge appuyé** (crimson-strong) / **lavis rouge** (crimson-wash): erreur, impayé, action destructive, pastille de compteur.
- **Ardoise** (slate) / **lavis ardoise** (slate-wash): information.

### Neutral
- **Papier** (paper): fond de page et barre supérieure.
- **Papier relevé** (paper-raised): panneaux, tableaux, champs, menus, fenêtres.
- **Papier creusé** (paper-sunken): barre latérale, en-têtes de tableau, marge des souches, pied de fenêtre, fonds désactivés.
- **Papier profond** (paper-deep): survol dans la barre latérale, avatars.
- **Papier voilé** (surface-muted): survol des lignes de registre et des souches.
- **Filet** (rule) et **filet appuyé** (rule-strong): séparations d'un pixel ; le filet appuyé borde les champs et dessine les perforations.
- **Encre** (ink), **encre seconde** (ink-2), **encre pâle** (ink-3): texte principal, texte secondaire, métadonnées. L'encre est aussi le fond du bouton primaire.

En mode sombre (papier carbone), le papier devient brun-noir (#1b1916 à #2c2823), l'encre crème (#ede6da) et les encres s'éclaircissent (orange #ff9a3c, texte orange #ffab5e, vert #4cc790) ; les valeurs exactes sont dans le sidecar.

### Named Rules
**The Flag Ink Rule.** L'orange #F77F00 et le vert #009E60 sont des encres de marque : ils dessinent, ils ne portent pas de texte. Tout texte orange passe par clay-ink, tout texte vert par olive.

**The One Accent Rule.** Une seule couleur d'accent par écran fait autorité : l'orange marque, le vert ne dit que « réglé ». Aucun autre aplat de couleur ne décore.

**The Never Color Alone Rule.** Une couleur sémantique est toujours doublée d'une icône, d'une flèche ou d'un libellé (variation, alerte, statut).

## Typography

**Display Font:** Source Serif 4 (avec Source Serif Pro, Georgia)
**Body Font:** Inter (avec Segoe UI, system-ui)

**Character:** Un serif de livre de comptes, posé et graisse moyenne, pour nommer les pages ; un sans de travail, net et compact, pour tout ce qui se manipule. Les chiffres sont toujours tabulaires.

### Hierarchy
- **Display** (500, 36px, 1.15): la salutation du tableau de bord ; 28px sur téléphone.
- **Headline** (500, 30px, 1.15): le titre de chaque page (H1 serif) ; 26px sur téléphone. Les titres de la connexion et de la vitrine montent jusqu'à 44px.
- **Section** (500, 22px, 1.25): titres de section du tableau de bord ; même serif pour les titres de fenêtre (21px), de fiche (20px) et d'état vide (18px).
- **Title** (600, 16px, 1.25): titres de panneau et de graphique, en sans.
- **Body** (400, 14px, 1.5): tout le texte de travail, cellules de tableau comprises. Les paragraphes d'introduction s'arrêtent à 70ch.
- **Label** (600, 13px): libellés de champ, boutons compacts, numéros de souche.
- **Caption** (400, 12px): métadonnées, sous-titres de cellule, légendes de période.
- **Figure** (600, 28px, 1.1, −0.02em, tabulaire): les chiffres clés ; 24px sous 860px, 20px sous 480px.
- **Stamp** (700, 11px, 0.1em, capitales): texte des tampons ; les badges en reprennent la taille à 600 et 0.06em.

### Named Rules
**The Serif Names, Sans Works Rule.** Le serif nomme (titres de page, de section, de fenêtre, de fiche) ; tout ce qui se lit en travaillant est en Inter. Un bouton, un champ ou une cellule n'est jamais en serif.

**The Tabular Figures Rule.** Montants FCFA, matricules, références, heures et pourcentages sont en chiffres tabulaires, alignés à droite dans les tableaux.

## Layout

Une seule grille de 4 px (espacements de 4 à 48 px). L'application tient dans une coquille : barre latérale de 248px sur papier creusé, barre supérieure de 56px, contenu limité à 1400px avec 32px de marge (24px sous 1100px, 16px sur téléphone).

Le tableau de bord se compose sur une grille de 12 colonnes (gouttière de 16px) : la colonne « Aujourd'hui » en souches sur 7 colonnes, les raccourcis sur 5. Sous 1100px les colonnes passent à la moitié, sous 860px tout s'empile. Les chiffres clés forment une bande de 4 cellules (2 sur téléphone) séparées par des filets, jamais une grille de cartes.

Chaque page s'ouvre sur un en-tête réglé : titre serif à gauche, une seule action primaire à droite, filet dessous. Sous 860px la barre latérale devient un tiroir, sous 640px les fenêtres deviennent des feuilles montant du bas. Au toucher, tous les contrôles atteignent 44px.

### Named Rules
**The 4px Grid Rule.** Tout espacement est un multiple de 4 px, pris dans l'échelle de tokens.

## Elevation & Depth

Le système est plat. Les panneaux posés sur la page n'ont aucune ombre : ils se distinguent par le ton du papier (creusé, papier, relevé) et par des filets d'un pixel. L'ombre n'existe que pour ce qui flotte au-dessus de la page et doit s'en détacher : menus, info-bulles, fenêtres, notifications, barre d'enregistrement collante, tiroir de navigation mobile.

### Shadow Vocabulary
- **Feuille soulevée** (`box-shadow: 0 8px 24px -10px rgba(48, 36, 20, 0.22), 0 2px 6px -2px rgba(48, 36, 20, 0.08)`): menus déroulants, info-bulles de graphique, navigation de la vitrine sur mobile.
- **Feuille détachée** (`box-shadow: 0 24px 56px -16px rgba(48, 36, 20, 0.32)`): fenêtres, notifications, barre d'enregistrement, tiroir mobile.
- **Anneau de focus** (`box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #f77f00`): tout élément focalisé au clavier ; rouge pour les actions destructives.

### Named Rules
**The Rules Not Shadows Rule.** Un panneau posé sur la page se sépare par un filet d'un pixel ou un changement de ton du papier, jamais par une ombre. L'ombre est réservée aux couches flottantes.

## Shapes

Des coins de papier : rayons de 3px (badges, tampons, puces), 4px (boutons, champs, alertes), 6px (panneaux, tableaux, listes de souches, menus) et 8px (fenêtres, zone de dépôt). Les seules formes rondes sont les avatars, les pastilles d'étape et le compteur de notifications. Les filets pleins séparent ; les filets en pointillés perforent : marge des souches, colonne de référence des tableaux, talon de la fiche élève, séparations internes d'une fiche, gouttière de l'emploi du temps.

## Components

### Buttons
Des boutons sobres et nets, qui pèsent par leur encre plutôt que par leur taille.
- **Shape:** coins légers (4px), hauteur de 40px (32px en compact, 46px en grand, 44px au toucher).
- **Primary:** orange du drapeau #F77F00 avec un texte encre (7,9:1), une seule par écran, pour la tâche la plus fréquente du profil. Jamais de texte blanc dessus.
- **Secondary:** orange encre sous texte blanc, réservé aux actions d'argent et de validation (encaisser, valider).
- **Hover / Focus:** l'aplat s'éclaircit ou s'assombrit d'un cran ; le bouton descend d'un pixel à l'appui ; anneau de focus orange décalé de 2px.
- **Outline / Ghost / Danger:** contour sur papier relevé pour les actions de second rang, fantôme pour les outils de barre, rouge registre pour la destruction (anneau de focus rouge), isolée des autres actions.

### Chips
- **Badge:** cartouche de 3px, filet à 45 % de la couleur du texte, lavis à 7 %, capitales espacées. Pour les états intermédiaires (à venir, en retard, terminé).
- **Tampon:** voir le composant signature.

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** papier relevé ; survol sur papier voilé pour les panneaux cliquables.
- **Shadow Strategy:** aucune (voir Elevation & Depth).
- **Border:** filet d'un pixel ; le filet appuyé au survol.
- **Internal Padding:** 20px.

### Inputs / Fields
- **Style:** papier relevé, filet appuyé, coins de 4px, hauteur de 40px ; libellé de 13px au-dessus.
- **Focus:** le contour passe à l'encre et un halo orange à 28 % l'entoure (3px).
- **Error / Disabled:** contour rouge et halo rouge, message d'erreur avec icône ; désactivé sur papier creusé, texte pâle.

### Navigation
- **Barre latérale:** vert forêt profond #0D3B2B (dérivé du vert du drapeau), texte blanc à 86 %, groupes en libellés de 12px à 60 %, liens de 36px (44px au toucher). Le lien actif se pose sur une pastille orange #F77F00 en texte encre ; la pastille glisse de l'élément de la page précédente vers le nouveau (420ms). Marque : la souche du logo (talon orange, lignes vert clair) et « School ERP » en serif blanc. La moitié gauche de la page de connexion reprend ce vert.
- **Onglets:** texte pâle, l'onglet actif à l'encre souligné de 2px d'orange.
- **Pagination:** page courante en vert forêt, texte blanc.

### Tables (registres)
En-têtes collants sur papier creusé en 12px, filet appuyé dessous ; lignes de 14px séparées par des filets, survol en papier voilé. La colonne de référence (facture, matricule) est une marge de souche : fond voilé, chiffres tabulaires, perforation en pointillés à droite. Les montants sont alignés à droite.

### Souche (signature)
La ligne d'enregistrement du système. Une grille en trois parties : une marge de 72px (64px sur téléphone) sur papier creusé, en chiffres tabulaires, qui porte le numéro ou l'heure ; une perforation d'un pixel en pointillés ; le contenu (titre en 14px demi-gras, métadonnées en 12px) ; l'état à droite. Hauteur minimale de 52px, filets entre les souches, une souche terminée passe à 60 % d'opacité. La fiche élève reprend la même logique en grand : le matricule écrit à la verticale dans un talon perforé.

### Tampon (signature)
L'état final se pose comme un coup de tampon : cartouche en capitales (11px, 700, 0.1em), filet de 1,5px doublé d'un contour à 40 %, inclinaison de −2° (−4° sur la vitrine), et une seule animation à l'arrivée (420ms, l'encre se pose en se réduisant légèrement). Orange encre par défaut (VALIDÉ), vert réglé pour ce qui est réglé ou acquis (PAYÉ, CONFIRMÉ, CANDIDATURE REÇUE). En mouvement réduit, il apparaît en fondu.

### Bande tricolore
Trois tiers égaux orange #F77F00, blanc #FFFFFF, vert #009E60, de 4px de haut, sur toute la largeur et tout en haut de la page. Dans l'application, elle reste fixée au-dessus du menu et de la barre du haut. Le tiers blanc porte un filet d'un pixel pour rester visible sur le fond blanc (inutile en mode sombre). Composant `FlagBand`.

### Bande de chiffres
Quatre chiffres clés dans une seule bande réglée : cellules séparées par des filets d'un pixel, chacune avec une teinte (élèves bleu, présence vert, encaissé orange, impayés rouge ; recouvrement ocre) posée en lavis de 5 % et en pastille d'icône à 15 %. Libellé de 13px, chiffre de 28px qui défile de 0 à sa valeur à l'arrivée (850ms, décélération), unité (FCFA) en petit à côté, variation avec flèche et période de comparaison. La période couverte s'écrit sous la bande.

### Mouvement
Un seul geste par écran, rapide : les cartes et les souches arrivent en cascade (520ms, décalages plafonnés à 200ms), les chiffres clés défilent, les graphiques se dessinent (700ms), la pastille du menu glisse, les icônes des raccourcis et des chiffres réagissent au survol. Avec « réduire les animations », tout passe en fondu court, les chiffres et les graphiques s'affichent directement.

### Page d'accueil (mode Persuade)
La page d'accueil (`src/app/home.css`) monte d'un cran l'échelle de l'application, sans changer d'univers :
- **Typographie d'affiche:** titre en serif de 40 à 72px (`clamp`), titres de section de 32 à 48px, mots clés en italique orange (#FFB15C sur vert, clay-ink sur blanc), corps de 17 à 20px.
- **Formes:** cartes de 12 à 16px de rayon, boutons de 52px de haut et 8px de rayon, appareils dessinés en CSS (ordinateur, téléphone) avec des captures miniatures de l'interface claire.
- **Couleurs:** bandeau d'ouverture et bandeau final en vert forêt avec deux halos (orange et vert du drapeau) ; chiffres du bandeau de chiffres en orange clair #FFB15C, vert #4FD29A et bleu #9CC0FF sur le vert.
- **Sections:** carnet de souches animé, moyens de paiement, avant / avec School ERP, onglets par profil avec aperçu d'appareil, niveaux (chacun relié à son école de démonstration), modules filtrables et dépliables, arguments locaux, chiffres réels de l'installation, écoles de démonstration, questions fréquentes, pied de page en quatre colonnes.
- **Mouvement:** le carnet s'écrit à l'ouverture (souches qui arrivent, tampons qui se posent, appel qui se remplit), puis les sections apparaissent au défilement ; sans JavaScript ou avec moins d'animations, tout est visible et passe en fondu.
- **Vérité des contenus:** aucun témoignage, client, prix ou chiffre de marché inventé ; les exemples du carnet sont signalés comme fictifs et les chiffres affichés viennent des écoles de démonstration.

## Do's and Don'ts

### Do:
- **Do** séparer les panneaux par des filets d'un pixel (rule) et par le ton du papier.
- **Do** mettre le numéro de chaque enregistrement (matricule, référence, heure) en marge, en chiffres tabulaires, derrière une perforation en pointillés.
- **Do** réserver le tampon incliné aux états finaux (payé, validé, confirmé) et le badge droit aux états intermédiaires ou en cours.
- **Do** utiliser clay-ink (#a85400) pour tout texte orange et olive (#00754a) pour tout texte vert.
- **Do** garder une seule action en encre pleine par écran, en haut à droite de l'en-tête.
- **Do** doubler toute couleur sémantique d'une icône, d'une flèche ou d'un libellé.
- **Do** porter chaque contrôle à 44px au toucher et respecter prefers-reduced-motion (fondus seulement).

### Don't:
- **Don't** poser du texte blanc sur l'orange #F77F00, ni écrire en orange ou en vert du drapeau purs.
- **Don't** ombrer un panneau posé sur la page ; l'ombre est réservée aux menus, fenêtres et notifications.
- **Don't** composer des grilles de cartes blanches ombrées avec des badges pastel.
- **Don't** revenir aux dégradés de l'ancienne interface, ni multiplier la bande tricolore : une seule par page, tout en haut, aux couleurs exactes du drapeau (#F77F00, #FFFFFF, #009E60).
- **Don't** utiliser le serif pour un bouton, un champ, une cellule ou un chiffre clé.
- **Don't** introduire une seconde couleur d'accent décorative.
