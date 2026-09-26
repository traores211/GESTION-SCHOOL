/**
 * Logic-less template engine for school documents.
 *   {{student.firstName}}                -> value, HTML-escaped (never raw)
 *   {{#each grades}} {{subject}} {{/each}} -> loop; inside, names resolve on the item first
 * Unknown variables are reported, never invented. Template HTML is sanitised: no scripts,
 * event handlers, javascript: URLs, iframes/objects/forms — and the UI shows documents in a
 * sandboxed iframe as a second barrier.
 */

export const VARIABLES: Record<string, { key: string; label: string }[]> = {
  COMMON: [
    { key: 'school.name', label: "Nom de l'établissement" },
    { key: 'school.address', label: 'Adresse' },
    { key: 'school.city', label: 'Ville' },
    { key: 'school.phone', label: 'Téléphone' },
    { key: 'school.email', label: 'Email' },
    { key: 'school.directeur', label: 'Nom du directeur' },
    { key: 'school.logoUrl', label: 'Logo (URL)' },
    { key: 'academicYear', label: 'Année scolaire' },
    { key: 'today', label: 'Date du jour' },
    { key: 'document.number', label: 'Numéro du document' },
    { key: 'document.verificationUrl', label: 'Lien de vérification' },
  ],
  STUDENT: [
    { key: 'student.firstName', label: 'Prénom' },
    { key: 'student.lastName', label: 'Nom' },
    { key: 'student.matricule', label: 'Matricule' },
    { key: 'student.dateOfBirth', label: 'Date de naissance' },
    { key: 'student.placeOfBirth', label: 'Lieu de naissance' },
    { key: 'student.gender', label: 'Sexe' },
    { key: 'student.nationality', label: 'Nationalité' },
    { key: 'class.name', label: 'Classe' },
    { key: 'class.level', label: 'Niveau' },
    { key: 'balance.remaining', label: 'Reste à payer (FCFA)' },
  ],
  STAFF: [
    { key: 'staff.firstName', label: 'Prénom' },
    { key: 'staff.lastName', label: 'Nom' },
    { key: 'staff.position', label: 'Poste' },
    { key: 'staff.hireDate', label: "Date d'embauche" },
  ],
  SCHOOL: [],
};

export function allowedKeys(context: string): string[] {
  return [...VARIABLES.COMMON, ...(VARIABLES[context] ?? [])].map((v) => v.key);
}

const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function lookup(path: string, ...scopes: unknown[]): unknown {
  for (const scope of scopes) {
    let cur: unknown = scope;
    let ok = true;
    for (const part of path.split('.')) {
      if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
      else {
        ok = false;
        break;
      }
    }
    if (ok) return cur;
  }
  return undefined;
}

/** Variables referenced by a template (outside loops) — used to report unknown ones. */
export function extractVariables(content: string): string[] {
  const withoutLoops = content.replace(/\{\{#each\s+[\w.]+\s*\}\}[\s\S]*?\{\{\/each\}\}/g, '');
  const found = new Set<string>();
  for (const m of withoutLoops.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) found.add(m[1]);
  return [...found];
}

export function render(content: string, data: Record<string, unknown>): { html: string; missing: string[] } {
  const missing = new Set<string>();
  const withLoops = content.replace(/\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_m, listPath: string, body: string) => {
    const list = lookup(listPath, data);
    if (!Array.isArray(list)) {
      missing.add(listPath);
      return '';
    }
    return list
      .map((item) => body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_x, p: string) => escapeHtml(lookup(p, item, data))))
      .join('');
  });
  const html = withLoops.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const value = lookup(path, data);
    if (value === undefined || value === null) {
      missing.add(path);
      return '';
    }
    return escapeHtml(value);
  });
  return { html, missing: [...missing] };
}

/** Removes executable content from template HTML. Conservative by design. */
export function sanitizeTemplate(html: string): string {
  const DANGEROUS = 'script|iframe|object|embed|form|input|button|textarea|select|link|meta|base|frame|frameset|applet';
  return html
    // Element with its content (<script>…</script>), then any leftover opening/closing tag.
    .replace(new RegExp(`<\\s*(${DANGEROUS})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, 'gi'), '')
    .replace(new RegExp(`<\\s*\\/?\\s*(${DANGEROUS})\\b[^>]*>`, 'gi'), '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\2/gi, '$1="#"')
    .replace(/expression\s*\(/gi, '(')
    .replace(/url\(\s*['"]?\s*javascript:[^)]*\)/gi, 'none');
}

/**
 * Maps placeholders written in "office" style ([NOM ÉLÈVE], «Prénom», {{nom}}) to known variables.
 * Deterministic synonym table; the AI assistant can propose more, but the user validates.
 */
const SYNONYMS: [RegExp, string][] = [
  [/^(nom( de l'| d'| )?[ée]l[èe]ve|nom|last ?name|nom de famille)$/i, 'student.lastName'],
  [/^(pr[ée]noms?( de l'| d'| )?[ée]l[èe]ve|pr[ée]noms?|first ?name)$/i, 'student.firstName'],
  [/^(matricule|n° ?matricule|num[ée]ro matricule)$/i, 'student.matricule'],
  [/^(date de naissance|n[ée]e? le|dob)$/i, 'student.dateOfBirth'],
  [/^(lieu de naissance|n[ée]e? [àa])$/i, 'student.placeOfBirth'],
  [/^(classe)$/i, 'class.name'],
  [/^(niveau)$/i, 'class.level'],
  [/^(ann[ée]e scolaire|ann[ée]e)$/i, 'academicYear'],
  [/^(date|date du jour|fait le)$/i, 'today'],
  [/^([ée]cole|[ée]tablissement|nom de l'[ée]cole)$/i, 'school.name'],
  [/^(directeur|directrice|chef d'[ée]tablissement)$/i, 'school.directeur'],
  [/^(ville)$/i, 'school.city'],
  [/^(adresse)$/i, 'school.address'],
  [/^(poste|fonction)$/i, 'staff.position'],
];

export function analyzeTemplate(content: string, context: string) {
  const allowed = allowedKeys(context);
  const used = extractVariables(content);
  const known = used.filter((v) => allowed.includes(v));
  const unknown = used.filter((v) => !allowed.includes(v));
  const placeholders = [...content.matchAll(/\[([^\]\n]{2,40})\]|«\s*([^»\n]{2,40})\s*»/g)].map((m) => (m[1] ?? m[2]).trim());
  const suggestions = [...new Set([...unknown, ...placeholders])].map((label) => {
    const clean = label.replace(/[_.]/g, ' ').trim();
    const match = SYNONYMS.find(([re]) => re.test(clean));
    return { placeholder: label, suggestion: match && allowed.includes(match[1]) ? match[1] : null };
  });
  return { known, unknown, suggestions };
}

/** Replaces validated placeholder → variable mappings in the template text. */
export function applyMappings(content: string, mappings: { placeholder: string; variable: string }[]) {
  let out = content;
  for (const { placeholder, variable } of mappings) {
    const esc = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\[${esc}\\]`, 'g'), `{{${variable}}}`)
      .replace(new RegExp(`«\\s*${esc}\\s*»`, 'g'), `{{${variable}}}`)
      .replace(new RegExp(`\\{\\{\\s*${esc}\\s*\\}\\}`, 'g'), `{{${variable}}}`);
  }
  return out;
}
