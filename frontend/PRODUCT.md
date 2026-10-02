# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Secrétariat, comptabilité, direction** : travaillent sur ordinateur toute la journée. Ils font des dizaines d'opérations par jour : inscriptions, fiches élèves, factures, encaissements Mobile Money, paie, annonces.
- **Enseignants** : font l'appel et saisissent les notes depuis un téléphone Android d'entrée de gamme, souvent en 3G/4G faible, pendant ou juste après le cours.
- **Parents** : consultent le portail « Mes enfants » sur mobile (notes, absences, factures).
- **Visiteurs** : découvrent un établissement sur sa vitrine publique (`/ecole/[code]`) et peuvent y déposer une demande d'inscription.

## Product Purpose

ERP scolaire pour les établissements de Côte d'Ivoire, extensible à l'Afrique francophone. Il centralise les élèves, les admissions, les classes, les emplois du temps, la présence, les notes et bulletins, la facturation (Mobile Money), le transport, la paie, les annonces, la vitrine publique et le portail parents. Le produit réussit quand le personnel administratif traite son volume quotidien sans friction, quand un enseignant fait l'appel en quelques secondes sur son téléphone et quand un parent voit d'un coup d'œil où en est son enfant.

## Positioning

Un « School ERP » complet, pas un simple outil de notes. Il est pensé pour les réalités locales : FCFA, Mobile Money (Orange / MTN / Moov / Wave), trimestres, matricules, appel « tous présents par défaut », import d'emplois du temps depuis Excel, PDF, Word ou photo (OCR, IA optionnelle).

## Operating Context

- Back-office multi-rôles : les droits sont appliqués par l'API ; le menu ne fait que les refléter (Direction, Secrétariat, Enseignement, Finance, Parent).
- Usage intensif au clavier et à la souris pour le personnel administratif ; usage tactile ponctuel pour les enseignants et les parents.
- Connexions parfois faibles, smartphones Android d'entrée de gamme.
- Documents produits : bulletins PDF, factures, exports.

## Capabilities and Constraints

- Stack : Next.js 15 (App Router), React 18, TypeScript, CSS maison (`src/app/globals.css`), icônes Lucide, Recharts. Backend NestJS (hors périmètre de la refonte).
- Interface entièrement en français.
- 22 routes : back-office, login, portail parents, vitrine publique et formulaire d'inscription.
- Aucun changement de comportement ni d'API ne fait partie de la refonte visuelle.

## Brand Commitments

- Nom : « School ERP ». Chaque école a sa propre vitrine, avec son nom et son logo.
- Direction choisie par le propriétaire (2026-10-01) : une esthétique **inspirée de Claude.ai** (titres en serif, calme et espace) sur **fond blanc partout** (choix du propriétaire, 2026-10-01), sans les dégradés de l'ancienne interface. Cette référence est une inspiration : on n'utilise ni le nom, ni le logo, ni les polices propriétaires d'Anthropic.
- Couleurs (choix du propriétaire, 2026-10-01) : celles du **drapeau de la Côte d'Ivoire**. L'orange #F77F00 sert d'accent, le vert #009E60 marque ce qui est réglé ou validé, et le blanc est le papier. L'orange ne porte jamais de texte blanc (contraste 2,6:1) : les textes utilisent ses variantes foncées.
- Couleur et mouvement (choix du propriétaire, 2026-10-01) : menu en vert forêt profond avec l'élément actif en orange plein, chiffres clés teintés, bouton principal orange ; animation « vivante mais sobre ».
- Bande tricolore (choix du propriétaire, 2026-10-01) : une fine bande orange-blanc-vert, aux couleurs exactes du drapeau, en haut de chaque page (application, connexion, accueil, vitrine, inscription).

## Evidence on Hand

- Comptes et données de démonstration issus du seed (voir README).
- `AUDIT.md` (2026-09-29) : audit UI et critique de l'existant (contraste du bouton primaire à 2,63:1, aucun mode sombre, 321 styles inline, aucun raccourci clavier).
- Aucun témoignage, client ni chiffre marketing réel : ne pas en inventer.

## Product Principles

1. Les usagers quotidiens d'abord : la vitesse et la densité lisible priment sur la décoration.
2. L'enseignant sur téléphone doit pouvoir tout faire d'une main, avec de grandes cibles.
3. Les données locales (FCFA, matricules, trimestres, opérateurs Mobile Money) structurent l'interface : elles ne sont pas du texte ordinaire.
4. Le calme inspire confiance : un seul accent et aucun décor sans fonction.

## Accessibility & Inclusion

Viser WCAG 2.1 AA : contraste de 4,5:1 pour le texte, cibles tactiles d'au moins 44 px sur mobile, navigation au clavier complète, `prefers-reduced-motion` respecté, modes clair et sombre.
