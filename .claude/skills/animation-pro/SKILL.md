---
name: animation-pro
description: Ajoute ou revoit les animations et micro-interactions de l'interface GESTION SCHOOL (transitions, feedback d'action, chargement/skeleton, ouverture/fermeture de modales et menus, notifications, formulaires, tableaux de bord), de façon sobre, performante et accessible (prefers-reduced-motion). À utiliser quand une interaction manque de feedback ou qu'une animation est envisagée.
---

# animation-pro — mouvement utile, jamais décoratif

Une animation n'est ajoutée **que si elle aide l'utilisateur** : comprendre d'où vient ou où va un élément, confirmer qu'une action a été prise en compte, faire patienter sans inquiéter. Si tu ne peux pas écrire en une phrase l'utilité UX d'une animation, ne l'ajoute pas. L'application doit rester rapide, professionnelle et sobre.

## 1. Quand animer (et quand ne pas le faire)

| Situation | Animation adaptée | À éviter |
|---|---|---|
| Survol / appui d'un bouton | changement de fond 120 ms, léger enfoncement à l'appui | rebonds, agrandissements |
| Action enregistrée | confirmation (toast, coche) 150–200 ms | confettis, animations longues |
| Chargement < 300 ms | rien (évite le clignotement) | spinner immédiat |
| Chargement > 300 ms | skeleton à la forme du contenu, pulsation douce | spinner plein écran |
| Ouverture de modale / tiroir / menu | fondu + translation 8–16 px, 180–220 ms ; fermeture plus rapide (120–160 ms) | zoom depuis le centre, rotation |
| Apparition d'une notification | glissement depuis le bord, 200 ms | secousses (sauf erreur bloquante, une seule fois) |
| Changement de valeur d'un KPI | transition de nombre ≤ 400 ms au premier affichage uniquement | recompter à chaque rafraîchissement |
| Erreur de formulaire | apparition du message sous le champ (fondu 150 ms) | tremblement du formulaire |
| Transition de page | aucune par défaut ; fondu 150 ms du contenu au maximum | glissements de page complets |
| Listes / lignes ajoutées | mise en évidence brève de la nouvelle ligne (fond qui s'estompe en 1 s) | animations en cascade sur 50 lignes |

## 2. Règles techniques

- **Tokens de mouvement** (dans `globals.css`) — n'utilise que ceux-ci :
  ```css
  --duration-fast: 120ms;   /* hover, press */
  --duration-base: 180ms;   /* ouverture, feedback */
  --duration-slow: 280ms;   /* grands panneaux */
  --ease-out: cubic-bezier(0.2, 0, 0, 1);      /* entrées */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);       /* sorties */
  ```
- N'anime **que** `opacity` et `transform` (composités par le GPU). Jamais `width`, `height`, `top`, `left`, `box-shadow` en boucle.
- CSS d'abord (transitions, `@keyframes`, `data-state` des primitives accessibles). Pas de bibliothèque d'animation sans justification (taille du bundle, maintenance, licence) validée via la procédure de dépendance du projet.
- Aucune animation ne doit bloquer l'interaction : l'utilisateur peut cliquer pendant une transition.
- Aucune animation infinie hors indicateur de chargement actif.

## 3. Accessibilité — obligatoire

Toute animation respecte `prefers-reduced-motion` :
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Avec mouvement réduit, l'information reste transmise (la coche de succès apparaît, sans mouvement). Pas de clignotement de plus de 3 fois par seconde (WCAG 2.3.1). Le focus clavier n'est jamais masqué par une animation.

## 4. Vérification

1. Tester chaque animation avec « Réduire les animations » activé dans l'OS / DevTools (émulation `prefers-reduced-motion`).
2. DevTools > Performance : pas de « layout » ni « paint » pendant l'animation, 60 i/s sur un mobile d'entrée de gamme (throttling CPU ×4).
3. Vérifier que la page n'a pas grossi de manière significative (First Load JS avant/après).
4. Rendre compte : animation ajoutée, utilité UX en une phrase, durée/courbe, comportement en mouvement réduit.
