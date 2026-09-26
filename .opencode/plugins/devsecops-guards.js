/**
 * Garde-fous DevSecOps pour opencode.
 *
 * opencode ne lit pas `.claude/settings.json` : les hooks Claude Code de
 * `.claude/hooks/*.sh` n'y sont jamais exécutés. Ce plugin en est l'équivalent,
 * avec la même intention : un contrôle qui compte est un contrôle que l'agent
 * ne peut pas contourner en étant simplement « convaincu » du contraire.
 *
 *   .claude/hooks/pre-commit-guard.sh  ->  garde 1 : git commit / git push
 *   .claude/hooks/dependency-guard.sh  ->  garde 2 : pip / npm install
 *   .claude/hooks/post-edit-scan.sh    ->  garde 3 : Semgrep après écriture
 *
 * Emplacement : `.opencode/plugins/` (le singulier `.opencode/plugin/` est
 * également accepté — voir `Glob.scan("{agent,agents}/**\/*.md")` côté opencode).
 *
 * Contrat des hooks (https://opencode.ai/docs/plugins/) :
 *   "tool.execute.before"(input {tool, sessionID, callID}, output {args})
 *       -> lever une Error BLOQUE l'exécution de l'outil.
 *   "tool.execute.after"(input {tool, sessionID, callID, args}, output {title, output, metadata})
 *       -> le texte ajouté à `output.output` est remonté à l'agent.
 */

/** Extensions scannées par Semgrep après écriture (mêmes que le hook Bash). */
const SCANNABLE = /\.(ts|tsx|js|jsx|mjs|prisma|ya?ml|json|conf)$|(^|[\/\\])Dockerfile$/

/** Fichiers dont l'écriture mérite un avertissement, même sans Semgrep. */
const SENSITIVE = /(^|\/)\.env|\.pem$|\.key$|id_rsa|\.tfstate$/

/** Délai maximal d'interrogation d'un registre public, en millisecondes. */
const REGISTRY_TIMEOUT_MS = 8000

export const DevSecOpsGuards = async ({ $, directory }) => {
  /** Vrai si le binaire est présent dans le PATH. */
  const available = async (bin) => (await $`which ${bin}`.quiet().nothrow()).exitCode === 0

  /**
   * Interroge un registre public.
   * @returns {Promise<true|false|null>} true = existe, false = inconnu (404),
   *          null = registre injoignable (on ne peut pas conclure).
   */
  const registryHas = async (url) => {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "devsecops-kit-dependency-guard" },
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      })
      if (res.ok) return true
      if (res.status === 404) return false
      return null
    } catch {
      return null
    }
  }

  /**
   * Garde 1 — `git commit` / `git push`.
   * Refuse le contournement des hooks Git, puis fait scanner l'index par Gitleaks.
   */
  const guardCommit = async (cmd) => {
    if (!/\bgit\s+(commit|push)\b/.test(cmd)) return

    if (/--no-verify|(^|\s)-n(\s|$)/.test(cmd)) {
      throw new Error(
        "BLOQUÉ : '--no-verify' est interdit dans ce dépôt (règle DevSecOps n°7). " +
          "Retire l'option et corrige la cause du blocage plutôt que le blocage lui-même.",
      )
    }

    if (!(await available("gitleaks"))) {
      // Fail-open assumé et signalé : un outil absent ne doit pas passer pour un contrôle réussi.
      console.warn(
        "[devsecops] gitleaks n'est pas installé — le contrôle des secrets avant commit n'a PAS tourné. " +
          "Installe-le : https://github.com/gitleaks/gitleaks",
      )
      return
    }

    // `gitleaks git --staged` est la forme actuelle ; `protect --staged` est la forme
    // dépréciée depuis la v8.19.0, conservée en repli pour les versions plus anciennes.
    let res = await $`gitleaks git --staged --redact --no-banner`.cwd(directory).quiet().nothrow()
    if (res.exitCode !== 0 && /unknown command|unknown flag/i.test(res.stderr.toString())) {
      res = await $`gitleaks protect --staged --redact --no-banner`.cwd(directory).quiet().nothrow()
    }

    if (res.exitCode !== 0) {
      const detail = `${res.stdout.toString()}${res.stderr.toString()}`.trim().split("\n").slice(-25).join("\n")
      throw new Error(
        "BLOQUÉ : Gitleaks a détecté un secret dans les fichiers stagés. Un secret commité est un secret " +
          "compromis : externalise-le (variable d'environnement / GitHub Secrets), retire-le du staging, " +
          `puis fais-le tourner (rotation).\n${detail}`,
      )
    }
  }

  /**
   * Garde 2 — anti-hallucination de dépendance (« slopsquatting »).
   * Vérifie sur le registre officiel que chaque package demandé existe réellement.
   */
  const guardDependencies = async (cmd) => {
    /** @type {{name: string, registry: string, url: string}[]} */
    const wanted = []

    const pip = cmd.match(/(?:^|[;&|]\s*)(?:pip3?|python3? -m pip)\s+install\s+([^;&|]*)/)
    if (pip && !/\s(-r|--requirement)\s|(^|\s)[.\/]/.test(pip[1])) {
      for (const token of pip[1].split(/\s+/)) {
        if (!token || token.startsWith("-")) continue
        const name = token.split(/[<>=!~[]/)[0].toLowerCase()
        if (name) wanted.push({ name, registry: "PyPI", url: `https://pypi.org/pypi/${encodeURIComponent(name)}/json` })
      }
    }

    const js = cmd.match(/(?:^|[;&|]\s*)(?:npm\s+(?:install|i|add)|pnpm\s+add|yarn\s+add)\s+([^;&|]*)/)
    if (js) {
      for (const token of js[1].split(/\s+/)) {
        if (!token || token.startsWith("-")) continue
        // Retire @version en conservant les scopes @org/pkg.
        const name = token.replace(/(?<!^)@[^/@]*$/, "")
        if (name) wanted.push({ name, registry: "npm", url: `https://registry.npmjs.org/${name.replace("/", "%2F")}` })
      }
    }

    for (const pkg of wanted) {
      const exists = await registryHas(pkg.url)

      if (exists === false) {
        throw new Error(
          `BLOQUÉ : le package '${pkg.name}' est introuvable sur ${pkg.registry}. Il s'agit peut-être d'une ` +
            "dépendance hallucinée (slopsquatting) — un attaquant peut publier un package sous ce nom. " +
            "Vérifie le nom exact, la réputation (téléchargements, dépôt source, mainteneurs) et propose " +
            "une alternative connue.",
        )
      }

      if (exists === null) {
        // Fail-closed délibéré : un contrôle qu'on ne peut pas exécuter n'est pas un contrôle réussi.
        throw new Error(
          `BLOQUÉ : impossible de joindre ${pkg.registry} pour vérifier l'existence de '${pkg.name}'. ` +
            "Ce n'est pas la preuve que le package est absent, c'est l'absence de preuve qu'il existe. " +
            "Rétablis l'accès réseau et relance, ou fais valider le package par un humain.",
        )
      }
    }
  }

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return
      const cmd = String(output.args?.command ?? "")
      if (!cmd) return

      await guardCommit(cmd)
      await guardDependencies(cmd)
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write") return

      const file = input.args?.filePath
      if (!file) return

      if (SENSITIVE.test(file)) {
        output.output += `\n\n[devsecops] ATTENTION : écriture dans un fichier sensible (${file}). Vérifie qu'il est dans .gitignore et qu'aucun secret réel n'y figure.`
      }

      if (!SCANNABLE.test(file)) return
      if (!(await available("semgrep"))) return

      const res = await $`semgrep scan --config p/owasp-top-ten --config p/secrets --config p/typescript --quiet --error --metrics=off --no-git-ignore ${file}`
        .cwd(directory)
        .quiet()
        .nothrow()

      // `--error` fait sortir Semgrep en non-zéro dès qu'un finding est remonté.
      if (res.exitCode === 0) return

      const findings = res.stdout.toString().trim().split("\n").slice(0, 40).join("\n")
      output.output +=
        `\n\n[devsecops] SEMGREP : findings potentiels dans ${file} (règles OWASP Top 10 / secrets). ` +
        "Traite-les ou justifie-les explicitement — ne les masque pas avec 'nosemgrep' sans accord humain.\n" +
        findings
    },
  }
}
