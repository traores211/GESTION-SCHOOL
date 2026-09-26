---
name: uix-pro
description: Audit et refonte UX/UI d'un écran ou d'un composant de GESTION SCHOOL (Next.js, frontend/src). À utiliser avant toute modification d'interface, pour un audit UX, le design system, le responsive/mobile, l'accessibilité (WCAG 2.2 AA), les formulaires, tableaux, tableaux de bord, états vides/erreur/chargement et l'onboarding.
---

# uix-pro — UX/UI professionnelle pour GESTION SCHOOL

Tu interviens comme product designer senior. Objectif : une application SaaS sobre, rapide, lisible, accessible, utilisable d'abord sur smartphone. **Tu analyses toujours l'écran avant de le modifier.**

Références du projet : `docs/audit/audit-ux.md` (constats existants), `docs/ux/design-system.md` (tokens et composants — la source de vérité visuelle), `docs/architecture/architecture-cible.md` §2.4 (thème par école).

## 1. Analyse obligatoire (avant tout code)

Pour l'écran visé, écris en quelques lignes :
1. **Utilisateur et contexte** : quel rôle (directeur, secrétaire, comptable, enseignant, parent), sur quel appareil (l'enseignant et le parent sont surtout sur smartphone), à quel moment.
2. **Information clé** : ce que l'utilisateur doit voir en premier.
3. **Action principale** (une seule mise en avant) et actions secondaires.
4. **Problèmes UX** (parcours, charge cognitive, étapes inutiles) et **problèmes visuels** (hiérarchie, densité, alignements, contraste).
5. **Éléments à supprimer** : ce qui n'apporte rien.
6. **États** à couvrir : chargement (skeleton), vide (avec action proposée), erreur (message utile + réessayer), succès, permission refusée.

Puis propose le changement, applique-le, et vérifie (§4).

## 2. Règles de conception

- **Design system d'abord** : uniquement les tokens (`var(--color-*)`, `--space-*`, `--radius-*`, `--font-*`) et les composants partagés de `frontend/src/components/ui/`. Aucune couleur, taille ou espacement en dur ; pas de `style={{…}}` sauf valeur réellement dynamique (ex. largeur d'une barre de progression).
- **Thème par école** : aucune couleur de marque codée en dur ; la couleur primaire vient du tenant. Vérifie le contraste AA des combinaisons texte/fond produites.
- **Hiérarchie** : un titre de page, une action principale visible, le reste en secondaire. Les KPI d'un tableau de bord répondent à « que dois-je faire aujourd'hui ? » et mènent à la liste filtrée correspondante.
- **Icônes** : une icône doit avoir une fonction claire. Pas d'icône par défaut devant les boutons ; pas d'emoji dans l'interface. Icônes SVG sobres pour la navigation et les actions compactes (avec `aria-label` et infobulle si le bouton n'a pas de texte).
- **Formulaires** : un `<label htmlFor>` par champ, `autocomplete` adapté, types d'input natifs (`tel`, `email`, `date`, `inputmode="decimal"` pour les notes), validation en ligne à la perte de focus, message d'erreur sous le champ relié par `aria-describedby`, bouton de soumission désactivé seulement pendant l'envoi. Ne jamais perdre une saisie (brouillon local pour les saisies longues : notes, appel).
- **Tableaux** : colonnes utiles seulement, tri et filtres visibles, pagination serveur au-delà de 50 lignes, actions de ligne regroupées ; sous 640 px, la ligne devient une carte.
- **Actions irréversibles** (payer, supprimer, publier) : confirmation explicite qui nomme l'objet et la conséquence ; bouton destructif distinct.
- **Mobile-first** : conçois à 360 px puis élargis. Cibles tactiles ≥ 44×44 px. Navigation mobile en barre inférieure (4 entrées selon le rôle) + tiroir. Pas de défilement horizontal de page.
- **Langue** : français clair, verbes d'action (« Enregistrer l'appel », pas « Valider »), montants en FCFA formatés `fr-FR`, dates lisibles.

## 3. Accessibilité (WCAG 2.2 AA) — non négociable

- Contraste texte ≥ 4.5:1 (≥ 3:1 pour texte large et composants d'interface).
- Tout est utilisable au clavier ; focus visible (`:focus-visible`) ; ordre logique.
- Modales : `role="dialog"`, `aria-modal`, titre relié, piège de focus, fermeture par Échap, retour du focus à l'élément déclencheur.
- Messages dynamiques (erreurs, succès) annoncés (`role="alert"` / `aria-live="polite"`).
- `lang="fr"` sur le document ; images informatives avec `alt`, décoratives avec `alt=""`.
- Taille de cible minimale 24×24 px (2.5.8), idéalement 44×44 px sur mobile.
- Respect de `prefers-reduced-motion` (voir le skill `animation-pro`).

## 4. Vérification avant de déclarer terminé

1. `npm run type-check --workspace=frontend` et `npx next build` (dans `frontend/`) passent ; noter la taille First Load JS de la page avant/après.
2. Parcours testé à 360 px, 768 px et 1280 px (Playwright ou navigateur).
3. Parcours complet au clavier seul.
4. Aucune violation critique ou sérieuse avec axe (extension ou `@axe-core/playwright`).
5. Les 5 états (chargement, vide, erreur, succès, refus) ont été vus.
6. Aucune régression sur les rôles qui utilisent l'écran (voir la matrice de `backend/src/authz/permissions.ts`).

Rends compte : écran, problèmes trouvés, changements, fichiers modifiés, mesures avant/après, points restants.
