# Design system — GESTION SCHOOL

Source : `frontend/src/app/globals.css` (tokens + classes) et `frontend/src/components/ui/` (composants). Règles de conception : skill `uix-pro` ; animations : skill `animation-pro`.

## 1. Tokens

| Famille | Tokens | Remarque |
|---|---|---|
| Marque (par école) | `--brand` (déf. `#1f5f4a`), `--accent` (déf. `#b45309`) | surchargés à l'exécution depuis la couleur de l'école ; `--brand-strong/soft`, `--accent-strong/soft` dérivés par `color-mix` |
| Neutres | `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-muted` | redéfinis en mode sombre (`prefers-color-scheme`) |
| États | `--danger`, `--warning`, `--success`, `--info` (+ `-light`) | tous ≥ 4,5:1 sur leur fond clair |
| Typo | `--font` (Source Sans 3 / système), `--text-xs` 12 → `--text-2xl` 28 | corps 14,5 px, champs 15 px |
| Espacement | `--space-1` 4 px → `--space-8` 32 px | grille de 4 px |
| Formes | `--radius-sm` 6, `--radius` 8, `--radius-lg` 12, `--shadow-sm/md`, `--focus-ring` | |
| Mouvement | `--duration-fast` 120 ms, `--duration-base` 180 ms, `--duration-slow` 280 ms, `--ease-out`, `--ease-in` | neutralisés par `prefers-reduced-motion` |

Contraste vérifié : blanc sur `--brand` par défaut ≈ 7,6:1 ; blanc sur `--accent` ≈ 5,0:1. Une école ne peut pas enregistrer une couleur principale < 4,5:1 (contrôle serveur + indicateur en direct).

## 2. Composants

| Composant | Implémentation | Règles |
|---|---|---|
| Bouton | `.btn` + `.btn-primary / -secondary / -outline / -ghost / -danger`, `.btn-sm`, `.btn-icon` | hauteur 40 px (32 px en `sm`), une seule action primaire par zone, pas d'icône décorative |
| Champ | `.field` > `label[htmlFor]` + `.input`, `.field-hint`, `.field-error` | label toujours relié ; erreurs liées par `aria-describedby`, `aria-invalid` |
| Sélecteur, zone de texte | `select.input`, `textarea.input` | |
| Case / interrupteur | `.toggle` | `accent-color` = marque |
| Tableau | `.table-wrap` (+ `.responsive` : cartes sous 640 px, `td[data-label]`) | pagination serveur au-delà de 50 lignes |
| Carte | `.card`, `.card-title` | |
| KPI | `.kpi-grid`, `.kpi-card`, `.kpi-label`, `.kpi-value` | chiffres tabulaires |
| Badge | `.badge-green / -orange / -danger / -warning / -info / -neutral` | |
| Onglets | `.tabs` + `button.tab[role=tab][aria-selected]` | |
| Modale | `components/ui/Modal.tsx` | `role=dialog`, `aria-modal`, focus piégé, Échap, retour du focus ; feuille basse sur mobile |
| Alertes | `.alert-error / -success / -info / -warning` ; `ErrorAlert` (`role=alert`, bouton Réessayer) | |
| Toast | `ToastProvider` / `useToast()` | confirmation sans voler le focus (`aria-live=polite`) |
| Chargement | `SkeletonRows` (`.skeleton`) | forme du contenu, pas de spinner plein écran |
| État vide | `EmptyState` | dit ce qui manque et propose l'action suivante |
| Icônes | `components/ui/Icon.tsx` (SVG trait 1,8) | navigation et actions compactes seulement ; `aria-label` si pas de texte |
| Navigation | `Shell` : barre latérale (≥ 860 px), barre inférieure + tiroir « Plus » (mobile), lien d'évitement | entrées filtrées par permissions et modules |
| Graphique simple | `.bars`, `.bar-row`, `.bar-fill` | barres CSS, valeur toujours écrite en clair |
| Grille EDT | `.tt-cell` (`.filled`, `.conflict`) | conflit signalé par couleur **et** texte |

## 3. Accessibilité (WCAG 2.2 AA)
Focus visible partout (`:focus-visible`), cibles ≥ 40 px (44 px sur la barre mobile), `lang="fr"`, messages dynamiques annoncés, contenus d'IA et de documents affichés comme texte (jamais du HTML injecté), documents dans une iframe `sandbox`. Contrôle automatisé : `@axe-core/playwright` sur les écrans clés (scénarios UI-03, 05, 10, 13, 20, 22).

## 4. Impression
`@media print` masque la navigation ; documents officiels en A4 avec `@page` (marges, pagination « Page n / N »), en-tête logo, pied de page, signature, cachet, QR code.
