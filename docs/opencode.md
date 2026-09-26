# Utiliser ce kit avec opencode

[opencode](https://opencode.ai) est un agent de code open source, terminal-first, compatible avec
de nombreux fournisseurs de modèles. Ce kit fonctionne avec lui — en grande partie **sans
adaptation**, parce qu'opencode lit nativement une partie des fichiers de Claude Code.

Ce document dit exactement ce qui est repris tel quel, ce qui a dû être porté, et ce qui
**n'a pas d'équivalent**. Les trois comptent : croire qu'un contrôle vous protège alors qu'il
n'est pas chargé est pire que savoir qu'il vous manque.

---

## 1. Matrice de compatibilité

Vérifiée sur la documentation et le code source d'opencode (voir § 7 pour les références).

| Couche du kit | Fichier Claude Code | opencode | Portage |
|---|---|---|---|
| **Règles** | `CLAUDE.md` | Lu nativement (si aucun `AGENTS.md` n'existe), et chargé explicitement par `opencode.json` | **aucun** |
| **Workflows** | `.claude/skills/*/SKILL.md` | Lus nativement — opencode cherche `.claude/skills/<nom>/SKILL.md` | **aucun** |
| **Invocation `/nom`** | `/security-review` | Les skills s'y chargent via l'outil `skill`, pas en `/nom` | `.opencode/commands/*.md` |
| **Spécialistes** | `.claude/agents/*.md` | **Ignorés** — seuls les dossiers `.opencode` sont scannés | `.opencode/agents/*.md` |
| **Permissions** | `.claude/settings.json` → `permissions` | Clé `permission` | `opencode.json` |
| **Garde-fous** | `.claude/hooks/*.sh` | **Ignorés** — opencode n'a pas de hooks shell | `.opencode/plugins/*.js` |
| **Revue de PR en CI** | `claude-security-review.yml` | Action `anomalyco/opencode/github` | `opencode-security-review.yml` |
| **Scanners en CI** | `security-gates.yml` | Identique — ce sont des outils, pas des agents | **aucun** |

Le point important : **la matière du kit — les règles, les prompts des spécialistes, les
procédures — est partagée.** Seul l'emballage change.

---

## 2. Installation

```bash
# depuis la racine de votre dépôt
cp -r /chemin/vers/agentic-devsecops-kit/.claude    ./   # règles + skills (lus par les deux outils)
cp -r /chemin/vers/agentic-devsecops-kit/.opencode  ./   # agents + commandes + garde-fous opencode
cp    /chemin/vers/agentic-devsecops-kit/CLAUDE.md  ./
cp    /chemin/vers/agentic-devsecops-kit/opencode.json ./
chmod +x .claude/hooks/*.sh

git add CLAUDE.md opencode.json .claude .opencode
git commit -m "chore: add DevSecOps agent configuration"
```

Gardez `.claude/` même si vous n'utilisez qu'opencode : c'est là que vivent les règles et les
skills, et opencode va les y chercher.

### Prérequis outils

Les mêmes que pour Claude Code — `gitleaks`, `semgrep`, `trivy`, `checkov`, `pip-audit` ou
`npm audit`. Le plugin de garde-fous les appelle ; s'ils sont absents, il le **dit** au lieu de
faire semblant d'avoir vérifié.

---

## 3. Ce qui est repris tel quel

### Les règles (`CLAUDE.md`)

opencode cherche ses règles dans cet ordre : `AGENTS.md`, puis `CLAUDE.md`. **Le premier trouvé
gagne** — les deux ne sont jamais fusionnés.

C'est un piège réel : si votre dépôt possède déjà un `AGENTS.md`, le `CLAUDE.md` du kit serait
**silencieusement ignoré**, et vous tourneriez sans aucune règle DevSecOps en croyant le contraire.
C'est pourquoi `opencode.json` contient :

```json
{ "instructions": ["CLAUDE.md"] }
```

Cette ligne charge les règles quoi qu'il arrive. Contrepartie : si vous n'avez **pas** d'`AGENTS.md`,
`CLAUDE.md` est probablement chargé deux fois (une fois comme règles, une fois comme instruction),
ce qui consomme un peu de contexte. Arbitrage assumé : du contexte gaspillé se voit, des règles de
sécurité absentes ne se voient pas. Retirez la ligne si votre situation est claire et stable.

### Les skills (`.claude/skills/`)

opencode charge les skills à la demande depuis `.claude/skills/<nom>/SKILL.md`, en plus de ses
propres emplacements. Les cinq skills du kit fonctionnent sans copie ni modification.

Le champ `allowed-tools:` de leur frontmatter est propre à Claude Code : opencode ignore les champs
qu'il ne connaît pas, sans erreur. Il n'y a donc **pas** de restriction d'outils appliquée au skill
côté opencode — la restriction réelle vient des permissions de l'agent et de `opencode.json`.

Pour désactiver cette compatibilité (si vous voulez isoler complètement les deux outils) :

```bash
export OPENCODE_DISABLE_CLAUDE_CODE=1         # tout le support .claude
export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1  # seulement .claude/skills
export OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1  # seulement ~/.claude/CLAUDE.md
```

---

## 4. Ce qui a été porté

### Les spécialistes → `.opencode/agents/`

opencode ne scanne que les dossiers `.opencode` : `.claude/agents/` lui est invisible. Les quatre
spécialistes sont donc **générés** dans `.opencode/agents/` par `scripts/sync-opencode.sh`, avec le
corps du prompt identique et un en-tête traduit :

| Claude Code | opencode |
|---|---|
| `name:` | le nom du fichier |
| `tools: Read, Grep, Glob` | `tools: { write: false, edit: false }` + `permission:` |
| `model: sonnet` | *omis* — chacun garde son fournisseur et son modèle |
| `maxTurns:` | pas d'équivalent |
| *(implicite)* | `mode: subagent` — requis pour la délégation |

Les fichiers de `.opencode/agents/` portent l'en-tête « Fichier GÉNÉRÉ » : **ne les éditez pas**,
modifiez `.claude/agents/` puis relancez le script (voir § 6).

Délégation : automatique d'après la `description`, ou manuelle avec `@security-reviewer`.

### Les commandes → `.opencode/commands/`

Dans Claude Code, un skill s'invoque par `/security-review`. Dans opencode, les skills sont chargés
par l'agent via l'outil `skill` — il n'y a pas de `/nom` automatique. Cinq wrappers générés
rétablissent l'ergonomie : `/security-review`, `/harden-dockerfile`, `/threat-model`,
`/dependency-check`, `/incident-report`. Chacun demande simplement le chargement du skill
correspondant, puis son application pas à pas.

### Les permissions → `opencode.json`

Traduction directe des `permissions` de `.claude/settings.json` :

| Claude Code | opencode |
|---|---|
| `defaultMode: "default"` | `"bash": { "*": "ask" }` |
| `Read(./**/*.pem)` en `deny` | `"read": { "*.pem": "deny" }` |
| `Bash(git status:*)` en `allow` | `"bash": { "git status*": "allow" }` |
| `Read(~/.aws/**)` en `deny` | `"read"` + `"external_directory"` |

**Règle d'ordre à connaître :** dans opencode, c'est la **dernière règle qui correspond** qui
gagne — l'inverse de l'intuition. Le `"*"` attrape-tout se met donc en **premier**, les règles
spécifiques ensuite. Le fichier du kit est écrit dans cet ordre : catch-all, puis `allow`, puis
`deny`. Si vous insérez une règle, respectez cet ordre ou vous ouvrirez ce que vous croyiez fermer.

opencode couvre un besoin que Claude Code n'exprime pas directement : `external_directory`, qui
contrôle l'accès à tout chemin hors du répertoire de travail.

### Les garde-fous → `.opencode/plugins/devsecops-guards.js`

opencode n'exécute pas les hooks de `.claude/settings.json`. Le plugin les réimplémente à
l'identique, en JavaScript :

| Hook Claude Code | Équivalent dans le plugin |
|---|---|
| `pre-commit-guard.sh` | `tool.execute.before` sur `bash` : refuse `--no-verify`, lance Gitleaks sur l'index, **bloque** en cas de secret |
| `dependency-guard.sh` | `tool.execute.before` sur `bash` : vérifie l'existence du package sur PyPI/npm, **bloque** sinon |
| `post-edit-scan.sh` | `tool.execute.after` sur `edit`/`write` : lance Semgrep et **avertit** (le fichier est déjà écrit) |

Dans opencode, un hook bloque en **levant une exception** — le message de l'erreur est ce que
l'agent lit, il doit donc expliquer quoi faire, pas seulement dire non.

Deux comportements méritent d'être connus :

- **Gitleaks absent → on laisse passer, et on le dit.** Un outil manquant ne doit jamais ressembler
  à un contrôle réussi.
- **Registre injoignable → on bloque.** L'impossibilité de vérifier qu'un package existe n'est pas
  une preuve qu'il existe. Vous serez bloqué hors ligne : c'est voulu.

Le plugin utilise `gitleaks git --staged`, forme actuelle ; il retombe automatiquement sur
`gitleaks protect --staged` (dépréciée depuis la v8.19.0) pour les installations plus anciennes.

---

## 5. Vérifier que le kit est réellement chargé

Ne supposez pas : prouvez. Dans opencode :

```
/security-review            les cinq commandes du kit doivent apparaître
@security-reviewer          les quatre spécialistes doivent être proposés
```

Puis le test qui compte — le garde-fou doit **bloquer** :

```bash
echo "AKIAIOSFODNN7EXAMPLE" > /tmp/k.txt && cp /tmp/k.txt ./k.txt
git add k.txt
# demandez ensuite à opencode de faire `git commit -m test` : le plugin doit refuser.
git reset k.txt && rm k.txt
```

Et l'anti-hallucination :

```
# demandez à opencode d'installer un paquet qui n'existe pas :
pip install ce-paquet-nexiste-vraiment-pas-2026
# le plugin doit bloquer avant l'exécution.
```

Si rien ne bloque, le plugin n'est pas chargé : vérifiez que le fichier est bien dans
`.opencode/plugins/` et relancez opencode.

---

## 6. Maintenir les deux versions sans qu'elles divergent

`.claude/` est la **source de vérité**. `.opencode/agents/` et `.opencode/commands/` en sont dérivés :

```bash
./scripts/sync-opencode.sh          # régénère après toute modification de .claude/
./scripts/sync-opencode.sh --check  # échoue si c'est périmé
```

Le job `kit-consistency` de `security-gates.yml` lance `--check` à chaque PR. Une divergence casse
la CI, au lieu de laisser un `security-reviewer` périmé rassurer les utilisateurs d'opencode.

Le plugin `.opencode/plugins/devsecops-guards.js` n'est **pas** généré : il est écrit à la main et
doit être modifié en parallèle des hooks `.claude/hooks/*.sh`.

Pour ajouter un spécialiste : créez-le dans `.claude/agents/`, ajoutez son profil de permissions
dans `profile_for()` du script, puis régénérez. Le script **échoue** si un agent n'a pas de profil —
un agent ne doit jamais hériter silencieusement de permissions par défaut.

---

## 7. Ce que ce portage ne fait pas

Honnêtement listé, parce qu'un manque documenté est gérable et un manque ignoré ne l'est pas.

- **Pas d'équivalent de `maxTurns`.** Les sous-agents Claude Code sont plafonnés en nombre de tours ;
  opencode n'expose pas ce garde-fou. Surveillez les sessions longues.
- **`allowed-tools` des skills n'est pas appliqué** côté opencode (champ inconnu, donc ignoré). La
  restriction effective vient des permissions de l'agent et de `opencode.json`.
- **Aucun modèle n'est imposé** dans les agents portés. Si vous branchez un modèle faible sur le
  `security-reviewer`, la revue vaudra ce que vaut ce modèle. Ajoutez `model:` dans le profil du
  script si vous voulez le fixer pour l'équipe.
- **Les deux workflows de revue de PR ne doivent pas tourner ensemble** : deux commentaires IA par
  PR, c'est la garantie que plus personne ne les lira. Choisissez-en un.
- **Les permissions ne sont pas un bac à sable.** Ni côté Claude Code ni côté opencode. Elles
  réduisent la surface d'erreur ; elles n'arrêtent pas un attaquant qui contrôle déjà la machine.

### Références vérifiées

- Règles et précédence `AGENTS.md` / `CLAUDE.md` — <https://opencode.ai/docs/rules/>
- Chargement des skills, y compris `.claude/skills/` — <https://opencode.ai/docs/skills/>
- Agents, `mode`, permissions par agent — <https://opencode.ai/docs/agents/>
- Commandes, `$ARGUMENTS` — <https://opencode.ai/docs/commands/>
- Plugins et signatures des hooks — <https://opencode.ai/docs/plugins/>
- Permissions, ordre d'évaluation, `external_directory` — <https://opencode.ai/docs/permissions/>
- Intégration GitHub — <https://opencode.ai/docs/github/>

Les dossiers `.opencode/agent(s)`, `.opencode/command(s)` et `.opencode/plugin(s)` sont acceptés au
singulier comme au pluriel. Le kit utilise le pluriel, forme retenue par la documentation.
