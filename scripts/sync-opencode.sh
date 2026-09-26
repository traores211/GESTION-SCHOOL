#!/usr/bin/env bash
# Dérive la configuration opencode à partir de la configuration Claude Code.
#
#   .claude/agents/*.md        ->  .opencode/agents/*.md     (frontmatter traduit)
#   .claude/skills/*/SKILL.md  ->  .opencode/commands/*.md    (wrapper /nom -> outil skill)
#
# Pourquoi générer plutôt que dupliquer : le corps des prompts est identique entre les
# deux outils, seul l'en-tête change. Deux copies finiraient par diverger, et un
# security-reviewer périmé est pire qu'absent — il rassure sans protéger. On garde donc
# UNE source de vérité (.claude/) et on dérive le reste, vérifié en CI par --check.
#
#   ./scripts/sync-opencode.sh          régénère
#   ./scripts/sync-opencode.sh --check  échoue si la génération est périmée (CI)

set -euo pipefail
cd "$(dirname "$0")/.."

SRC_AGENTS=".claude/agents"
SRC_SKILLS=".claude/skills"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

# Frontmatter opencode par agent : traduit la clé `tools:` de Claude Code en
# `tools:` + `permission:` opencode, à capacités équivalentes.
# Volontairement sans `model:` : chacun garde son fournisseur et son modèle.
profile_for() {
  case "$1" in
    security-reviewer)
      # Lecture seule stricte : un reviewer ne modifie pas ce qu'il relit.
      cat <<'YAML'
mode: subagent
temperature: 0.1
tools:
  write: false
  edit: false
permission:
  edit: deny
  webfetch: deny
  bash:
    "*": ask
    "git diff*": allow
    "git log*": allow
    "git status*": allow
    "semgrep*": allow
    "npm audit*": allow
YAML
      ;;
    threat-modeler)
      # Écrit docs/security/threat-model.md ; n'a aucun besoin du shell.
      cat <<'YAML'
mode: subagent
temperature: 0.1
tools:
  edit: false
  bash: false
permission:
  bash: deny
  webfetch: deny
YAML
      ;;
    pipeline-hardener)
      # Modifie build/CI/infra ; prépare mais ne déclenche jamais un effet de bord.
      cat <<'YAML'
mode: subagent
temperature: 0.1
permission:
  webfetch: deny
  bash:
    "*": ask
    "git push*": deny
    "docker push*": deny
    "terraform apply*": deny
    "terraform destroy*": deny
    "terraform validate*": allow
    "terraform plan*": allow
    "trivy*": allow
    "checkov*": allow
YAML
      ;;
    incident-analyst)
      # Analyse des preuves : il les lit et les cite, il ne les détruit jamais.
      cat <<'YAML'
mode: subagent
temperature: 0.1
tools:
  edit: false
permission:
  edit: deny
  webfetch: deny
  bash:
    "*": ask
    "grep*": allow
    "jq*": allow
    "sort*": allow
    "uniq*": allow
    "rm*": deny
    "truncate*": deny
    "shred*": deny
YAML
      ;;
    *)
      echo "ERREUR : aucun profil opencode défini pour l'agent '$1'." >&2
      echo "Ajoute-le dans profile_for() — ne laisse pas un agent hériter des permissions par défaut." >&2
      exit 1
      ;;
  esac
}

# Description sur une seule ligne, extraite du frontmatter source.
description_of() {
  local desc
  desc="$(sed -n 's/^description: //p' "$1" | head -n 1)"
  if [ -z "$desc" ]; then
    echo "ERREUR : pas de 'description:' sur une seule ligne dans $1." >&2
    exit 1
  fi
  printf '%s' "$desc"
}

# Corps = tout ce qui suit la deuxième ligne '---' (fin du frontmatter).
body_of() {
  awk 'BEGIN{n=0} /^---[[:space:]]*$/{n++; if(n<=2) next} n>=2' "$1"
}

generate_agents() {
  local out="$1/agents"
  mkdir -p "$out"

  for src in "$SRC_AGENTS"/*.md; do
    local name
    name="$(basename "$src" .md)"
    {
      echo "---"
      echo "# Fichier GÉNÉRÉ par scripts/sync-opencode.sh — ne pas éditer à la main."
      echo "# Source de vérité : $src"
      echo "description: $(description_of "$src")"
      profile_for "$name"
      echo "---"
      body_of "$src"
    } > "$out/$name.md"
  done
}

generate_commands() {
  local out="$1/commands"
  mkdir -p "$out"

  # opencode charge les skills à la demande via l'outil `skill`, mais n'en fait pas
  # des commandes `/nom` comme Claude Code. Ces wrappers rétablissent cette ergonomie.
  for src in "$SRC_SKILLS"/*/SKILL.md; do
    local name desc short
    name="$(basename "$(dirname "$src")")"
    desc="$(description_of "$src")"
    short="$(printf '%s' "$desc" | sed 's/\([^.]*\.\).*/\1/')" # première phrase seulement

    cat > "$out/$name.md" <<EOF
---
# Fichier GÉNÉRÉ par scripts/sync-opencode.sh — ne pas éditer à la main.
# Source de vérité : $src
description: $short
agent: build
---

Applique la procédure du skill \`$name\` à ce dépôt.

Charge d'abord sa définition complète avec l'outil skill — \`skill({ name: "$name" })\` —
puis suis ses étapes dans l'ordre, sans en sauter et sans en inventer. Respecte ses
interdits, et termine par la commande qui prouve le résultat.

Périmètre demandé : \$ARGUMENTS
(si vide, prends le périmètre par défaut décrit dans le skill)
EOF
  done
}

generate_into() {
  generate_agents "$1"
  generate_commands "$1"
}

if [ "$CHECK" = "1" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  generate_into "$tmp"
  if ! diff -ru --exclude=plugins ".opencode" "$tmp" > /dev/null 2>&1; then
    echo "ÉCHEC : .opencode/ n'est pas à jour avec .claude/." >&2
    echo "Lance ./scripts/sync-opencode.sh et commite le résultat." >&2
    diff -ru --exclude=plugins ".opencode" "$tmp" || true
    exit 1
  fi
  echo "OK : .opencode/ est synchronisé avec .claude/."
else
  generate_into ".opencode"
  echo "Agents   : $(ls -1 .opencode/agents | tr '\n' ' ')"
  echo "Commandes: $(ls -1 .opencode/commands | tr '\n' ' ')"
fi
