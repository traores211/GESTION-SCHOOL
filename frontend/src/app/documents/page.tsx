"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import Modal from "../../components/ui/Modal";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/session";
import { EmptyState, ErrorAlert, SkeletonRows, useToast } from "../../components/ui/States";

interface Template {
  id: string;
  name: string;
  type: string;
  context: "STUDENT" | "STAFF" | "SCHOOL";
  currentVersion: number;
  versions: { version: number; content: string }[];
}
interface HistoryRow {
  id: string;
  number: string;
  createdAt: string;
  verificationCode: string;
  templateVersion: { version: number; template: { name: string } };
}
interface Suggestion {
  placeholder: string;
  suggestion: string | null;
}

/** Documents are shown in a sandboxed iframe (no scripts, no same-origin): defence in depth. */
function DocFrame({ html, title }: { html: string; title: string }) {
  return <iframe title={title} sandbox="allow-modals" srcDoc={html} style={{ width: "100%", height: "70vh", border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }} />;
}

function printHtml(html: string) {
  const w = window.open("", "_blank", "noopener=no");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export default function DocumentsPage() {
  const { can } = useSession();
  const toast = useToast();
  const writer = can("documents:write");
  const [tab, setTab] = useState<"generate" | "templates" | "history">("generate");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [students, setStudents] = useState<{ id: string; firstName: string; lastName: string; matricule: string }[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [variables, setVariables] = useState<{ key: string; label: string }[]>([]);
  const [viewing, setViewing] = useState<{ title: string; html: string } | null>(null);

  const template = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s, h] = await Promise.all([
        api.get<Template[]>("/documents/templates"),
        api.get<typeof students>("/students?pageSize=500"),
        api.get<HistoryRow[]>("/documents"),
      ]);
      setTemplates(t);
      setStudents(s);
      setHistory(h);
      if (!templateId && t[0]) setTemplateId(t.find((x) => x.context === "STUDENT")?.id ?? t[0].id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doPreview = async () => {
    setError(null);
    try {
      const r = await api.post<{ html: string; missing: string[] }>("/documents/preview", { templateId, subjectId: subjectId || undefined });
      setPreview(r.html);
      setMissing(r.missing);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const generate = async () => {
    setError(null);
    try {
      const r = await api.post<{ id: string; number: string }>("/documents/generate", { templateId, subjectId: subjectId || undefined });
      toast(`Document ${r.number} généré`);
      const html = await api.get<string>(`/documents/${r.id}/html`);
      setViewing({ title: r.number, html });
      setHistory(await api.get<HistoryRow[]>("/documents"));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openEditor = async (t: Template) => {
    const full = await api.get<Template>(`/documents/templates/${t.id}`);
    setEditing(full);
    setDraft(full.versions[0]?.content ?? "");
    setSuggestions([]);
    const v = await api.get<{ variables: { key: string; label: string }[] }>(`/documents/variables?context=${t.context}`);
    setVariables(v.variables);
  };

  const analyze = async () => {
    if (!editing) return;
    const r = await api.post<{ unknown: string[]; suggestions: Suggestion[] }>("/documents/analyze", { content: draft, context: editing.context });
    setSuggestions(r.suggestions);
  };

  const applySuggestions = async () => {
    if (!editing) return;
    const mappings = suggestions.filter((s) => s.suggestion).map((s) => ({ placeholder: s.placeholder, variable: s.suggestion! }));
    const r = await api.post<{ content: string; analysis: { suggestions: Suggestion[] } }>("/documents/apply-mappings", { content: draft, context: editing.context, mappings });
    setDraft(r.content);
    setSuggestions(r.analysis.suggestions);
  };

  const saveVersion = async () => {
    if (!editing) return;
    try {
      const r = await api.put<{ version: number }>(`/documents/templates/${editing.id}`, { content: draft });
      toast(`Version ${r.version} enregistrée`);
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const subjectLabel = template?.context === "STAFF" ? "Membre du personnel (identifiant)" : "Élève";

  return (
    <Shell title="Documents">
      <div className="page-header">
        <div>
          <h1>Documents officiels</h1>
          <p>Certificats, attestations et courriers numérotés, imprimables en A4 et vérifiables par QR code.</p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Sections">
        {[
          ["generate", "Générer"],
          ["templates", "Modèles"],
          ["history", "Historique"],
        ].map(([k, label]) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k as typeof tab)}>
            {label}
          </button>
        ))}
      </div>

      <ErrorAlert message={error} onRetry={load} />
      {loading ? (
        <SkeletonRows />
      ) : tab === "generate" ? (
        <div className="grid-2">
          <div className="card">
            <div className="field">
              <label htmlFor="doc-template">Modèle</label>
              <select id="doc-template" className="input" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(null); }}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (v{t.currentVersion})
                  </option>
                ))}
              </select>
            </div>
            {template?.context === "STUDENT" ? (
              <div className="field">
                <label htmlFor="doc-subject">{subjectLabel}</label>
                <select id="doc-subject" className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setPreview(null); }}>
                  <option value="">Choisir un élève…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lastName} {s.firstName} — {s.matricule}
                    </option>
                  ))}
                </select>
              </div>
            ) : template?.context === "STAFF" ? (
              <div className="field">
                <label htmlFor="doc-subject">{subjectLabel}</label>
                <input id="doc-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
              </div>
            ) : null}
            <div className="row">
              <button type="button" className="btn btn-outline" onClick={doPreview} disabled={!templateId || (template?.context !== "SCHOOL" && !subjectId)}>
                Aperçu
              </button>
              {writer && (
                <button type="button" className="btn btn-primary" onClick={generate} disabled={!templateId || (template?.context !== "SCHOOL" && !subjectId)}>
                  Générer le document
                </button>
              )}
            </div>
            {missing.length > 0 && (
              <div className="alert alert-warning" role="status" style={{ marginTop: 12 }}>
                Données manquantes dans le dossier : {missing.join(", ")}. Complétez la fiche avant de générer le document officiel.
              </div>
            )}
          </div>
          <div>{preview ? <DocFrame html={preview} title="Aperçu du document" /> : <EmptyState title="Aperçu" text="Choisissez un modèle et un élève, puis « Aperçu »." />}</div>
        </div>
      ) : tab === "templates" ? (
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Modèle</th>
                <th>Concerne</th>
                <th>Version</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td data-label="Modèle">{t.name}</td>
                  <td data-label="Concerne">{{ STUDENT: "Élève", STAFF: "Personnel", SCHOOL: "Établissement" }[t.context]}</td>
                  <td data-label="Version">v{t.currentVersion}</td>
                  <td style={{ textAlign: "right" }}>
                    {writer && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => openEditor(t)}>
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : history.length === 0 ? (
        <EmptyState title="Aucun document généré" text="Les documents générés apparaissent ici avec leur numéro et leur code de vérification." />
      ) : (
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Modèle</th>
                <th>Date</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td data-label="Numéro">{h.number}</td>
                  <td data-label="Modèle">
                    {h.templateVersion.template.name} (v{h.templateVersion.version})
                  </td>
                  <td data-label="Date">{new Date(h.createdAt).toLocaleString("fr-FR")}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={async () => setViewing({ title: h.number, html: await api.get<string>(`/documents/${h.id}/html`) })}>
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <Modal title={`Document ${viewing.title}`} onClose={() => setViewing(null)} boxStyle={{ maxWidth: 900 }}>
          <DocFrame html={viewing.html} title={`Document ${viewing.title}`} />
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => printHtml(viewing.html)}>
              Imprimer / enregistrer en PDF
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Modèle : ${editing.name}`} onClose={() => setEditing(null)} boxStyle={{ maxWidth: 980 }}>
          <div className="grid-2">
            <div>
              <div className="field">
                <label htmlFor="tpl-content">Contenu (HTML, variables entre accolades doubles)</label>
                <textarea id="tpl-content" className="input" style={{ minHeight: 320, fontFamily: "ui-monospace, monospace", fontSize: 13 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <span className="field-hint">
                  Collez un modèle existant : les zones comme [Nom élève] ou « Classe » sont reconnues par l&apos;analyse. Scripts et liens actifs sont supprimés à l&apos;enregistrement.
                </span>
              </div>
              <div className="row">
                <button type="button" className="btn btn-outline btn-sm" onClick={analyze}>
                  Analyser le modèle
                </button>
                {suggestions.some((s) => s.suggestion) && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={applySuggestions}>
                    Appliquer les correspondances proposées
                  </button>
                )}
              </div>
              {suggestions.length > 0 && (
                <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                  {suggestions.map((s) => (
                    <li key={s.placeholder}>
                      « {s.placeholder} » → {s.suggestion ? <code>{`{{${s.suggestion}}}`}</code> : <span className="text-danger">aucune variable connue, à corriger</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <span className="field-label">Variables disponibles</span>
              <ul style={{ listStyle: "none", marginTop: 8, maxHeight: 380, overflowY: "auto" }}>
                {variables.map((v) => (
                  <li key={v.key} className="row" style={{ justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{v.label}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft((d) => `${d}{{${v.key}}}`)} aria-label={`Insérer ${v.label}`}>
                      <code>{`{{${v.key}}}`}</code>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={saveVersion}>
              Enregistrer une nouvelle version
            </button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
