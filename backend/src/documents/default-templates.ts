/** Templates offered to every school on first use (editable, versioned). */
export const DEFAULT_TEMPLATES = [
  {
    type: 'CERTIFICAT_SCOLARITE',
    name: 'Certificat de scolarité',
    context: 'STUDENT',
    content: `<h1 class="doc-title">Certificat de scolarité</h1>
<p>Je soussigné(e), <strong>{{school.directeur}}</strong>, directeur de <strong>{{school.name}}</strong>, certifie que l'élève :</p>
<table class="doc-fields">
  <tr><th>Nom et prénoms</th><td>{{student.lastName}} {{student.firstName}}</td></tr>
  <tr><th>Matricule</th><td>{{student.matricule}}</td></tr>
  <tr><th>Né(e) le</th><td>{{student.dateOfBirth}} à {{student.placeOfBirth}}</td></tr>
  <tr><th>Classe</th><td>{{class.name}}</td></tr>
</table>
<p>est régulièrement inscrit(e) dans notre établissement pour l'année scolaire <strong>{{academicYear}}</strong>.</p>
<p>En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.</p>
<p class="doc-place">Fait à {{school.city}}, le {{today}}</p>`,
  },
  {
    type: 'ATTESTATION_INSCRIPTION',
    name: "Attestation d'inscription",
    context: 'STUDENT',
    content: `<h1 class="doc-title">Attestation d'inscription</h1>
<p>L'établissement <strong>{{school.name}}</strong> atteste que <strong>{{student.firstName}} {{student.lastName}}</strong>
(matricule {{student.matricule}}) est inscrit(e) en classe de <strong>{{class.name}}</strong> au titre de l'année scolaire {{academicYear}}.</p>
<p>Situation financière à ce jour : reste à payer <strong>{{balance.remaining}} FCFA</strong>.</p>
<p class="doc-place">Fait à {{school.city}}, le {{today}}</p>`,
  },
  {
    type: 'ATTESTATION_TRAVAIL',
    name: 'Attestation de travail',
    context: 'STAFF',
    content: `<h1 class="doc-title">Attestation de travail</h1>
<p>Je soussigné(e), <strong>{{school.directeur}}</strong>, directeur de <strong>{{school.name}}</strong>, atteste que
<strong>{{staff.firstName}} {{staff.lastName}}</strong> est employé(e) dans notre établissement en qualité de
<strong>{{staff.position}}</strong> depuis le {{staff.hireDate}}.</p>
<p>La présente attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.</p>
<p class="doc-place">Fait à {{school.city}}, le {{today}}</p>`,
  },
];

/** A4 print layout: header (logo, school), footer (page numbers), signature, stamp, QR code. */
export function printLayout(opts: {
  body: string;
  schoolName: string;
  logoUrl?: string | null;
  address?: string | null;
  footerText?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  qrDataUrl: string;
  number: string;
  verificationUrl: string;
  primaryColor?: string | null;
}) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const color = /^#[0-9a-f]{6}$/i.test(opts.primaryColor ?? '') ? opts.primaryColor : '#1f5f4a';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(opts.number)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm; @bottom-center { content: "Page " counter(page) " / " counter(pages); font-size: 9pt; color: #555; } }
  * { box-sizing: border-box; }
  body { font-family: "Source Sans 3", "Segoe UI", Arial, sans-serif; color: #1a1a1a; font-size: 11.5pt; line-height: 1.55; margin: 0; }
  .doc { max-width: 178mm; margin: 0 auto; padding: 8mm 0; }
  .doc-header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid ${color}; padding-bottom: 8px; margin-bottom: 18px; }
  .doc-header img { max-height: 56px; max-width: 120px; object-fit: contain; }
  .doc-header .name { font-weight: 700; font-size: 14pt; color: ${color}; }
  .doc-header .addr { font-size: 9.5pt; color: #555; }
  .doc-title { text-align: center; font-size: 17pt; text-transform: uppercase; letter-spacing: .04em; margin: 16px 0 22px; }
  .doc-fields { border-collapse: collapse; margin: 12px 0; width: 100%; }
  .doc-fields th { text-align: left; width: 40%; font-weight: 600; padding: 4px 8px; background: #f3f5f4; }
  .doc-fields td { padding: 4px 8px; border-bottom: 1px solid #e3e3e3; }
  .doc-place { margin-top: 24px; text-align: right; }
  .doc-sign { display: flex; justify-content: flex-end; gap: 16px; margin-top: 12px; min-height: 80px; }
  .doc-sign img { max-height: 90px; }
  .doc-footer { margin-top: 28px; border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5pt; color: #555; }
  .doc-footer img { width: 76px; height: 76px; }
  @media screen { body { background: #e9ecea; } .doc { background: #fff; padding: 16mm; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.12); } }
</style></head><body><main class="doc">
<header class="doc-header">${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="">` : ''}<div><div class="name">${esc(opts.schoolName)}</div>${opts.address ? `<div class="addr">${esc(opts.address)}</div>` : ''}</div></header>
${opts.body}
<div class="doc-sign">${opts.stampUrl ? `<img src="${esc(opts.stampUrl)}" alt="Cachet">` : ''}${opts.signatureUrl ? `<img src="${esc(opts.signatureUrl)}" alt="Signature">` : ''}</div>
<footer class="doc-footer"><div>N° ${esc(opts.number)}${opts.footerText ? ` · ${esc(opts.footerText)}` : ''}<br>Vérifier l'authenticité : ${esc(opts.verificationUrl)}</div><img src="${opts.qrDataUrl}" alt="QR code de vérification"></footer>
</main></body></html>`;
}
