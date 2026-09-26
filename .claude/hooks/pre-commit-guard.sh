#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash)
# Bloque `git commit` / `git push` si Gitleaks détecte un secret dans les fichiers stagés.
# Reçoit sur stdin le JSON {"tool_name":"Bash","tool_input":{"command":"..."}}.
# Exit 0 = laisser passer · Exit 2 = bloquer (le message stderr est renvoyé à Claude).

set -u
. "$(dirname "$0")/_lib.sh"
INPUT="$(cat)"
# Si aucun parseur JSON n'est disponible, on raisonne sur le JSON brut : un faux positif
# (scan Gitleaks inutile) vaut mieux qu'un commit non contrôlé.
CMD="$(json_field "$INPUT" command)" || CMD="$INPUT"

# Ne s'applique qu'aux commits et pushes
case "$CMD" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

# Refuser explicitement le contournement des hooks Git
if printf '%s' "$CMD" | grep -Eq -- '--no-verify|(^| )-n( |$)'; then
  echo "BLOCKED: '--no-verify' est interdit dans ce dépôt (règle DevSecOps n°7). Retire l'option et corrige la cause." >&2
  exit 2
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "WARNING: gitleaks n'est pas installé — le contrôle des secrets avant commit n'a PAS tourné. Installe-le (winget install Gitleaks.Gitleaks)." >&2
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Scanner uniquement ce qui est stagé (rapide), en masquant les valeurs.
# `gitleaks git --staged` est la forme actuelle ; `protect --staged` (dépréciée depuis 8.19) en repli.
OUT="$(gitleaks git --staged --redact --no-banner 2>&1)"; RC=$?
if [ $RC -ne 0 ] && printf '%s' "$OUT" | grep -qiE 'unknown (command|flag)'; then
  OUT="$(gitleaks protect --staged --redact --no-banner 2>&1)"; RC=$?
fi
if [ $RC -ne 0 ]; then
  echo "BLOCKED: Gitleaks a détecté un secret dans les fichiers stagés. Un secret commité est un secret compromis : externalise-le (variable d'environnement / GitHub Secrets), retire-le du staging, puis fais-le tourner (rotation). Voir docs/security/secrets.md." >&2
  printf '%s\n' "$OUT" | tail -n 25 >&2
  exit 2
fi

exit 0
