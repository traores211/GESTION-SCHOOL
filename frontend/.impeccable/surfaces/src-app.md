---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: ["src/components"]
---

# Surface brief : application School ERP (toutes les routes)

Scope : toute l'application. Back-office et portail en mode **Operate**, login en Operate, vitrine publique `/ecole/[code]` en **Persuade** dans le même monde.
Audience : secrétariat, comptabilité et direction sur PC (volume quotidien) ; enseignants sur Android d'entrée de gamme (appel, notes) ; parents sur mobile.
Contraintes : aucun changement de comportement ni d'API ; français ; AA ; mode clair et sombre ; cibles de 44 px au tactile.
Moment mémorable : un dossier se lit comme une souche numérotée, et son état se pose comme un tampon.

## Direction contract

THESIS: Chaque enregistrement est une souche de carnet de reçus : son numéro (matricule, référence, heure) est en marge en chiffres tabulaires, le contenu suit une perforation et l'état se pose comme un tampon d'encre. Refusé : la grille SaaS de cartes blanches ombrées avec des badges pastel.

OWN-WORLD: Papier crème chaud et encre presque noire, les encres du drapeau ivoirien : orange #F77F00 pour les tampons et les marques (une variante foncée pour le texte), vert #009E60 pour « réglé ». Les panneaux sont séparés par des filets d'un pixel, sans ombre portée. Titres en serif, interface en sans de travail, chiffres tabulaires. Les tampons sont des cartouches en capitales, bordés d'un filet et légèrement inclinés (−2°) pour les seuls états finaux (PAYÉ, VALIDÉ, ABSENT). Grille de 4 px ; rayons de 2 à 6 px. Le sombre est un papier carbone : brun-noir chaud et encre crème.

STORY: L'usager voit d'abord ce qui l'attend aujourd'hui, en souches. Il reconnaît chaque dossier par son numéro, lit son état d'un coup d'œil et agit sans quitter la ligne.

FIRST VIEWPORT: Tableau de bord, en haut à gauche : la date en petites capitales et une salutation en serif de 36 px. Dessous, une bande de 4 chiffres clés séparés par des filets verticaux (pas de cartes). Puis la colonne « Aujourd'hui » en souches : marge de 72 px pour l'heure ou le numéro, une perforation en pointillés, le libellé et le tampon d'état. L'action primaire (encre pleine) est en haut à droite.

FORM: Carnet à souches, position 5 de la liste ordonnée ; seed key 787d07e6. Raises : filets sans ombre et actions destructives isolées (console) ; colonnes immobiles (palettes) ; une même échelle pour toute comparaison (folio) ; une seule grille de 4 px (Crouwel).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
