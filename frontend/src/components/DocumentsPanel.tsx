"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { EmptyState, FormError, TableSkeleton, useFeedback } from "./ui";
import { api, authorizedFetch, errorMessage } from "../lib/api";
import { downloadFile } from "../lib/download";
import { getStoredUser } from "../lib/auth";

export const DOCUMENT_CATEGORIES: Record<string, string> = {
  PHOTO: "Photo d'identité",
  BULLETIN: "Bulletin",
  ACTE_NAISSANCE: "Acte de naissance",
  CERTIFICAT_SCOLARITE: "Certificat de scolarité",
  PIECE_IDENTITE: "Pièce d'identité",
  CONTRAT: "Contrat",
  DIPLOME: "Diplôme",
  ADMINISTRATIF: "Document administratif",
  JUSTIFICATIF: "Pièce justificative",
  AUTRE: "Autre",
};

interface Doc {
  id: string;
  name: string;
  type: string;
  category: string;
  fileSize: number | null;
  documentDate: string | null;
  version: number;
  status: "ACTIF" | "ARCHIVE";
  visibility: "INTERNE" | "FAMILLE";
  uploadedByName: string | null;
  uploadedAt: string;
}

const OFFICE = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "SECRETARY"];
const MANAGEMENT = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];
const size = (bytes: number | null) => (bytes == null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`);

async function sendFile(path: string, file: File, fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value) body.append(key, value);
  body.append("file", file);
  const res = await authorizedFetch(api.fileUrl(path), { method: "POST", body });
  if (!res.ok) {
    const message = await res
      .json()
      .then((b) => b?.message)
      .catch(() => null);
    throw new Error(Array.isArray(message) ? message.join(", ") : message || `Erreur ${res.status}`);
  }
}

/** Documents of a pupil record (or of a staff record with `staffUserId`): add, replace, archive, open. */
export default function DocumentsPanel({ studentId, staffUserId }: { studentId?: string; staffUserId?: string }) {
  const feedback = useFeedback();
  const role = getStoredUser()?.role ?? "";
  const canEdit = staffUserId ? MANAGEMENT.includes(role) : OFFICE.includes(role);
  const canDelete = MANAGEMENT.includes(role);
  const target = studentId ? `studentId=${studentId}` : `staffUserId=${staffUserId}`;
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "AUTRE", visibility: "INTERNE" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<Doc | null>(null);

  const load = useCallback(() => {
    setDocs(null);
    api
      .get<Doc[]>(`/documents?${target}${archived ? "&archived=true" : ""}`)
      .then((list) => {
        setDocs(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [target, archived]);
  useEffect(load, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      feedback.success(done);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choisissez un fichier (PDF, JPEG ou PNG, 8 Mo maximum)");
    return run(async () => {
      await sendFile("/documents", file, { ...(studentId ? { studentId } : { staffUserId: staffUserId! }), ...form });
      setForm({ ...form, name: "" });
      if (fileRef.current) fileRef.current.value = "";
    }, "Document ajouté");
  };

  const replace = (file: File | undefined) => {
    if (!file || !replacing) return;
    const doc = replacing;
    setReplacing(null);
    return run(() => sendFile(`/documents/${doc.id}/replace`, file, {}), `Nouvelle version de « ${doc.name} » enregistrée`);
  };

  const remove = async (doc: Doc) => {
    const yes = await feedback.confirm({ title: `Supprimer définitivement « ${doc.name} » ?`, message: "Le fichier est effacé du serveur. Cette action ne peut pas être annulée.", confirmLabel: "Supprimer", tone: "danger" });
    if (yes) await run(() => api.delete(`/documents/${doc.id}`), "Document supprimé");
  };

  return (
    <div>
      <FormError message={error} />
      {canEdit && (
        <form onSubmit={add} className="form-grid" style={{ alignItems: "end", marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="doc-file" className="required">
              Fichier
            </label>
            <input id="doc-file" ref={fileRef} type="file" className="input" accept="application/pdf,image/jpeg,image/png" required />
          </div>
          <div className="field">
            <label htmlFor="doc-name">Intitulé</label>
            <input id="doc-name" className="input" maxLength={120} placeholder="Nom du fichier par défaut" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="doc-cat">Type de document</label>
            <select id="doc-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(DOCUMENT_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {studentId && (
            <div className="field">
              <label htmlFor="doc-vis">Visible par</label>
              <select id="doc-vis" className="input" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                <option value="INTERNE">L&apos;établissement uniquement</option>
                <option value="FAMILLE">L&apos;établissement et la famille</option>
              </select>
            </div>
          )}
          <div className="field full">
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>
              <Upload size={15} /> Ajouter au dossier
            </button>
          </div>
        </form>
      )}
      <label className="checkbox" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        Documents archivés (anciennes versions comprises)
      </label>
      <input ref={replaceRef} type="file" hidden accept="application/pdf,image/jpeg,image/png" aria-hidden="true" tabIndex={-1} onChange={(e) => { replace(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="table-wrap">
        {!docs ? (
          !error && <TableSkeleton columns={4} rows={3} />
        ) : docs.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title={archived ? "Aucun document archivé" : "Aucun document dans ce dossier"} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Ajouté</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="cell-main">{d.name}</div>
                    <div className="cell-sub">
                      {d.type} · {size(d.fileSize)} · version {d.version}
                      {studentId && d.visibility === "FAMILLE" && <> · <span className="badge badge-info">Partagé avec la famille</span></>}
                    </div>
                  </td>
                  <td>{DOCUMENT_CATEGORIES[d.category] ?? d.category}</td>
                  <td>
                    <span className="tabular">{new Date(d.uploadedAt).toLocaleDateString("fr-FR")}</span>
                    {d.uploadedByName && <div className="cell-sub">par {d.uploadedByName}</div>}
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadFile(`/documents/${d.id}/file`, d.name).catch((err) => setError(errorMessage(err)))} aria-label={`Télécharger ${d.name}`}>
                      <Download size={15} /> Ouvrir
                    </button>
                    {canEdit && d.status === "ACTIF" && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setReplacing(d); replaceRef.current?.click(); }} aria-label={`Remplacer ${d.name} par une nouvelle version`}>
                        <RefreshCw size={15} /> Remplacer
                      </button>
                    )}
                    {canEdit && d.status === "ACTIF" && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.patch(`/documents/${d.id}`, { status: "ARCHIVE" }), "Document archivé")} aria-label={`Archiver ${d.name}`}>
                        <Archive size={15} /> Archiver
                      </button>
                    )}
                    {canEdit && d.status === "ARCHIVE" && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.patch(`/documents/${d.id}`, { status: "ACTIF" }), "Document restauré")}>
                        Restaurer
                      </button>
                    )}
                    {canDelete && d.status === "ARCHIVE" && (
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={busy} onClick={() => remove(d)} aria-label={`Supprimer définitivement ${d.name}`}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
