"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { KpiCard } from "../../components/dashboard/ui";
import { api, errorMessage } from "../../lib/api";
import { downloadFile } from "../../lib/download";

interface Settings {
  retentionYears: number;
  privacyContact: string;
  archived: number;
  anonymized: number;
  due: number;
  encryption: boolean;
}

interface ArchivedStudent {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  archivedAt: string;
  archiveReason: string | null;
  due: boolean;
}

function PrivacyContent() {
  const feedback = useFeedback();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rows, setRows] = useState<ArchivedStudent[] | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ retentionYears: 5, privacyContact: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Settings>("/privacy/settings")
      .then((s) => {
        setSettings(s);
        setForm({ retentionYears: s.retentionYears, privacyContact: s.privacyContact ?? "" });
      })
      .catch((err) => setError(errorMessage(err)));
    api
      .get<ArchivedStudent[]>(`/privacy/archived${dueOnly ? "?due=true" : ""}`)
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [dueOnly]);
  useEffect(load, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("settings");
    try {
      await api.patch("/privacy/settings", form);
      feedback.success("Réglages enregistrés");
      load();
    } catch (err) {
      feedback.error("Enregistrement impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const exportData = async (s: ArchivedStudent) => {
    setBusy(`export:${s.id}`);
    try {
      await downloadFile(`/privacy/students/${s.id}/export`, `donnees-${s.matricule}.json`);
    } catch (err) {
      feedback.error("Export impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const anonymize = async (s: ArchivedStudent) => {
    const reason = await feedback.prompt({
      title: `Anonymiser le dossier de ${s.firstName} ${s.lastName} ?`,
      message: "L'identité de l'élève et de ses responsables est effacée définitivement, ainsi que les pièces du dossier d'admission. Les notes, les présences et les factures sont conservées sans nom. Cette action ne peut pas être annulée.",
      label: "Motif",
      confirmLabel: "Anonymiser définitivement",
    });
    if (!reason) return;
    setBusy(`anon:${s.id}`);
    try {
      const result = await api.post<{ guardiansErased: number; filesDeleted: number }>(`/privacy/students/${s.id}/anonymize`, { reason });
      feedback.success("Dossier anonymisé", `${result.guardiansErased} responsable(s) effacé(s), ${result.filesDeleted} pièce(s) supprimée(s).`);
      load();
    } catch (err) {
      feedback.error("Anonymisation impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Données personnelles"
        description="Droits des familles (accès, effacement), durée de conservation et protection des données sensibles."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => downloadFile("/privacy/school-export", "export-etablissement.json").catch((err) => feedback.error("Export impossible", errorMessage(err)))}>
              <Download size={16} /> Exporter toutes les données
            </button>
            <Link className="btn btn-outline" href="/confidentialite" target="_blank">
              Voir la notice publique
            </Link>
          </>
        }
      />

      {settings && !settings.encryption && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 16 }}>
          <TriangleAlert size={16} />
          <div className="alert-body">
            <strong>Le chiffrement des données de santé est inactif.</strong> La clé DATA_ENCRYPTION_KEY n&apos;est pas configurée sur le serveur.
          </div>
        </div>
      )}

      {settings && (
        <div className="kpi-grid">
          <KpiCard label="À anonymiser" icon={<EyeOff size={16} />} value={settings.due} accent={settings.due ? "orange" : "green"} sub={`archivés depuis plus de ${settings.retentionYears} an(s)`} />
          <KpiCard label="Dossiers archivés" icon={<ShieldCheck size={16} />} value={settings.archived} sub="conservés avec leur identité" />
          <KpiCard label="Dossiers anonymisés" icon={<EyeOff size={16} />} value={settings.anonymized} sub="identité effacée" />
          <KpiCard label="Données de santé" icon={<LockKeyhole size={16} />} value={settings.encryption ? "Chiffrées" : "En clair"} accent={settings.encryption ? "green" : "danger"} sub="allergies, besoins particuliers" />
        </div>
      )}

      <form className="card" style={{ marginBottom: 20 }} onSubmit={save}>
        <h2 className="card-title" style={{ marginBottom: 12 }}>
          Conservation et contact
        </h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pv-years">Durée de conservation après le départ (années)</label>
            <input id="pv-years" type="number" min={1} max={30} className="input" required value={form.retentionYears} onChange={(e) => setForm({ ...form, retentionYears: Number(e.target.value) })} />
            <span className="field-hint">Passé ce délai, le dossier apparaît dans la liste « à anonymiser ».</span>
          </div>
          <div className="field">
            <label htmlFor="pv-contact">Contact pour les demandes des familles</label>
            <input id="pv-contact" type="email" className="input" placeholder="direction@ecole.ci" value={form.privacyContact} onChange={(e) => setForm({ ...form, privacyContact: e.target.value })} />
            <span className="field-hint">Indiqué sur les exports remis aux familles.</span>
          </div>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={busy === "settings"}>
          {busy === "settings" && <LoaderCircle size={16} className="spin" />} Enregistrer
        </button>
      </form>

      <div className="table-toolbar">
        <label className="checkbox">
          <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
          Seulement les dossiers arrivés en fin de conservation
        </label>
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Informations indisponibles">
            {error}
          </EmptyState>
        ) : !rows ? (
          <TableSkeleton columns={4} rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title={dueOnly ? "Aucun dossier à anonymiser" : "Aucun dossier archivé"}>
            {dueOnly ? "Tous les dossiers archivés sont encore dans leur durée de conservation." : "Les élèves archivés apparaissent ici ; un élève actif s'exporte depuis sa fiche."}
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Élève</th>
                <th>Archivé le</th>
                <th>Motif</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="cell-main">
                      {s.lastName} {s.firstName}
                    </div>
                    <div className="cell-sub tabular">{s.matricule}</div>
                  </td>
                  <td className="nowrap">
                    {new Date(s.archivedAt).toLocaleDateString("fr-FR")}
                    {s.due && (
                      <div>
                        <span className="badge badge-warning">Fin de conservation</span>
                      </div>
                    )}
                  </td>
                  <td>{s.archiveReason ?? <span className="muted">—</span>}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportData(s)} disabled={busy !== null}>
                      <Download size={14} /> Exporter
                    </button>
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => anonymize(s)} disabled={busy !== null}>
                      <EyeOff size={14} /> Anonymiser
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function PrivacyPage() {
  return (
    <Shell title="Données personnelles">
      <PrivacyContent />
    </Shell>
  );
}
