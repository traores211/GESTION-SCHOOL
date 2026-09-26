#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write)
# Après chaque écriture de fichier, lance Semgrep (règles OWASP + TypeScript/Node) sur ce fichier et
# remonte les findings à Claude comme avertissement. Ne bloque pas (le fichier est déjà écrit) :
# c'est le pipeline CI et la branch protection qui bloquent. Ici on rend le problème visible tout de suite.

set -u
. "$(dirname "$0")/_lib.sh"
INPUT="$(cat)"
FILE="$(json_field "$INPUT" file_path)" || exit 0
{ [ -z "$FILE" ] || [ ! -f "$FILE" ]; } && exit 0

# Alerte immédiate si le fichier écrit ressemble à un secret / clé (protection défensive supplémentaire)
case "$FILE" in
  *.env|*/.env|*\\.env|*.env.*|*.pem|*.key|*id_rsa*|*.tfstate)
    case "$FILE" in *.env.example) ;; *)
      echo "WARNING: écriture dans un fichier sensible ($FILE). Vérifie qu'il est dans .gitignore et qu'aucun secret réel n'y figure." >&2 ;;
    esac ;;
esac

# Ne scanner que le code source et la configuration
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.prisma|*.yml|*.yaml|*.json|*Dockerfile|*.conf) ;;
  *) exit 0 ;;
esac

if ! command -v semgrep >/dev/null 2>&1; then
  echo "WARNING: semgrep n'est pas installé — le scan SAST de $FILE n'a PAS tourné." >&2
  exit 0
fi

# Semgrep rapide, sortie compacte, uniquement les findings
OUT="$(semgrep scan --config p/owasp-top-ten --config p/secrets --config p/typescript --quiet --error --metrics=off --no-git-ignore "$FILE" 2>/dev/null)" && exit 0
[ -z "$OUT" ] && exit 0   # code retour ≠ 0 sans finding = erreur réseau/règles, pas un finding
{
  echo "SEMGREP: findings potentiels dans $FILE (OWASP Top 10 / secrets / TypeScript). Traite-les ou justifie-les explicitement — ne les masque pas avec 'nosemgrep' sans accord humain."
  printf '%s\n' "$OUT" | head -n 40
} >&2
exit 0
