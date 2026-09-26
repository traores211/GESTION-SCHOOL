#!/usr/bin/env bash
# Fonctions partagées par les hooks. Sourcé, jamais exécuté directement.
#
# Pourquoi ce fichier : sur Windows, `python3` est souvent l'alias du Microsoft Store, qui échoue.
# Les hooks d'origine du kit en dépendaient pour lire le JSON reçu sur stdin : la commande lue
# était alors vide et le garde-fou laissait TOUT passer, sans rien dire. On lit donc le JSON avec
# node (le runtime du projet, toujours présent), puis python, et en dernier recours le texte brut.

# json_field <json> <champ de tool_input>  ->  imprime la valeur (vide si absente)
json_field() {
  local json="$1" field="$2" out
  if command -v node >/dev/null 2>&1; then
    out="$(printf '%s' "$json" | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        try { process.stdout.write(String((JSON.parse(s).tool_input || {})[process.argv[1]] || "")); }
        catch { process.exit(3); }
      });' "$field" 2>/dev/null)" && { printf '%s' "$out"; return 0; }
  fi
  local py
  for py in python3 python; do
    if "$py" -c 'import sys' >/dev/null 2>&1; then
      out="$(printf '%s' "$json" | "$py" -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get(sys.argv[1],""))' "$field" 2>/dev/null)" && { printf '%s' "$out"; return 0; }
    fi
  done
  return 1
}
