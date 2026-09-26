#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash)
# Anti-hallucination de dépendance (« slopsquatting ») : avant `npm install X` / `pip install X`,
# vérifie que X existe sur le registre officiel. Bloque si le package est introuvable.
# Exit 0 = laisser passer · Exit 2 = bloquer.

set -u
. "$(dirname "$0")/_lib.sh"
INPUT="$(cat)"
if ! CMD="$(json_field "$INPUT" command)"; then
  # Impossible de lire la commande : on ne bloque que si elle ressemble à une installation.
  if printf '%s' "$INPUT" | grep -Eq '(npm (install|i|add)|pnpm add|yarn add|pip3? install) '; then
    echo "BLOCKED: impossible de lire la commande (ni node ni python disponibles) — l'existence du package n'a pas pu être vérifiée. Fais valider l'installation par un humain." >&2
    exit 2
  fi
  exit 0
fi

# Renvoie 0 si HTTP 200, 1 si 404, 2 si le registre est injoignable (on ne peut pas conclure).
check_url() {
  local code
  if command -v curl >/dev/null 2>&1; then
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1")"
  else
    code="$(node -e 'fetch(process.argv[1],{signal:AbortSignal.timeout(8000)}).then(r=>console.log(r.status)).catch(()=>console.log(0))' "$1" 2>/dev/null)"
  fi
  case "$code" in
    200) return 0 ;;
    404) return 1 ;;
    *)   return 2 ;;
  esac
}

verify() {  # $1 = nom · $2 = registre · $3 = url
  check_url "$3"
  case $? in
    0) return 0 ;;
    1) echo "BLOCKED: le package '$1' est introuvable sur $2. Il s'agit peut-être d'une dépendance hallucinée (slopsquatting) — un attaquant peut publier un package sous ce nom. Vérifie le nom exact, la réputation (téléchargements, dépôt source, mainteneurs) et propose une alternative connue." >&2 ;;
    *) echo "BLOCKED: impossible de joindre $2 pour vérifier '$1'. Ce n'est pas la preuve que le package est absent, c'est l'absence de preuve qu'il existe. Rétablis l'accès réseau ou fais valider le package par un humain." >&2 ;;
  esac
  exit 2
}

# ---- npm install / npm i / pnpm add / yarn add <pkgs>   (écosystème principal du projet)
if printf '%s' "$CMD" | grep -Eq '(^|[;&| ])(npm (install|i|add)|pnpm add|yarn add)( |$)'; then
  PKGS="$(printf '%s' "$CMD" | sed -E 's/.*(npm (install|i|add)|pnpm add|yarn add)//; s/[;&|].*//' | tr ' ' '\n' | grep -Ev '^(-|$)')"
  for p in $PKGS; do
    case "$p" in ./*|../*|/*|file:*|git+*|http*) continue ;; esac   # chemins locaux / URL explicites
    name="$(printf '%s' "$p" | sed -E 's/(.)@[^/]*$/\1/')"          # retire @version (garde les scopes @org/pkg)
    [ -z "$name" ] && continue
    enc="$(printf '%s' "$name" | sed 's#/#%2F#g')"
    verify "$name" "npm" "https://registry.npmjs.org/${enc}"
  done
fi

# ---- pip / pip3 / python -m pip install <pkgs>   (outillage : semgrep, checkov…)
if printf '%s' "$CMD" | grep -Eq '(^|[;&| ])(pip3?|python3? -m pip) install'; then
  # ignorer les installs depuis un fichier de requirements ou un chemin local
  if printf '%s' "$CMD" | grep -Eq -- ' -r | --requirement | \./| /'; then exit 0; fi
  PKGS="$(printf '%s' "$CMD" | sed -E 's/.*(pip3?|python3? -m pip) install//; s/[;&|].*//' | tr ' ' '\n' | grep -Ev '^(-|$)')"
  for p in $PKGS; do
    name="$(printf '%s' "$p" | sed -E 's/[<>=!~\[].*$//' | tr '[:upper:]' '[:lower:]')"
    [ -z "$name" ] && continue
    verify "$name" "PyPI" "https://pypi.org/pypi/${name}/json"
  done
fi

exit 0
