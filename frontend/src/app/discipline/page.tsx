"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Scale, Trash2 } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, Pagination, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import { searchKey } from "../../lib/useTable";

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
}

interface DisciplineRow {
  id: string;
  date: string;
  kind: string;
  reason: string;
  description: string | null;
  sanction: string | null;
  reportedByName: string | null;
  visibleToParents: boolean;
  student: StudentOption & { enrollments: { class: { name: string } }[] };
}

interface Stats {
  byKind: { kind: string; label: string; count: number }[];
}

const KINDS: Record<string, { label: string; badge: string }> = {
  OBSERVATION: { label: "Observation", badge: "badge-neutral" },
  AVERTISSEMENT: { label: "Avertissement", badge: "badge-warning" },
  RETENUE: { label: "Retenue", badge: "badge-warning" },
  EXCLUSION: { label: "Exclusion temporaire", badge: "badge-danger" },
  CONVOCATION: { label: "Convocation des parents", badge: "badge-danger" },
  ENCOURAGEMENT: { label: "Encouragement", badge: "badge-green" },
};
const MANAGEMENT = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];
const todayIso = () => new Date().toISOString().slice(0, 10);
const EMPTY = { studentId: "", date: todayIso(), kind: "OBSERVATION", reason: "", description: "", sanction: "", visibleToParents: true };

function DisciplineContent() {
  const feedback = useFeedback();
  const canDelete = MANAGEMENT.includes(getStoredUser()?.role ?? "");
  const [data, setData] = useState<{ items: DisciplineRow[]; total: number; page: number; pageSize: number; pageCount: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [filters, setFilters] = useState({ kind: "", q: "" });
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [studentFilter, setStudentFilter] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (filters.kind) q.set("kind", filters.kind);
    if (filters.q) q.set("q", filters.q);
    api
      .get<NonNullable<typeof data>>(`/discipline?${q}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    api.get<Stats>("/discipline/stats").then(setStats).catch(() => {});
  }, [filters, page]);
  useEffect(load, [load]);

  useEffect(() => {
    api.get<StudentOption[]>("/students").then(setStudents).catch(() => {});
  }, []);

  const matches = useMemo(() => {
    const key = searchKey(studentFilter);
    return (key ? students.filter((s) => searchKey(`${s.lastName} ${s.firstName} ${s.matricule}`).includes(key)) : students).slice(0, 60);
  }, [students, studentFilter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentId) return setFormError("Choisissez l'élève concerné");
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/discipline", { ...form, description: form.description || undefined, sanction: form.sanction || undefined });
      feedback.success("Signalement enregistré", form.visibleToParents ? "La famille est informée." : "Note interne, non visible de la famille.");
      setOpen(false);
      setForm({ ...EMPTY, date: todayIso() });
      setStudentFilter("");
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: DisciplineRow) => {
    const yes = await feedback.confirm({ title: "Supprimer ce signalement ?", message: `${KINDS[r.kind]?.label ?? r.kind} du ${new Date(r.date).toLocaleDateString("fr-FR")} — ${r.student.lastName} ${r.student.firstName}. La suppression est consignée dans le journal d'audit.`, confirmLabel: "Supprimer", tone: "danger" });
    if (!yes) return;
    try {
      await api.delete(`/discipline/${r.id}`);
      feedback.success("Signalement supprimé");
      load();
    } catch (err) {
      feedback.error("Suppression impossible", errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Vie scolaire"
        description="Observations, sanctions et encouragements : ce qui s'est passé, qui l'a signalé et ce qui a été décidé."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setFormError(null);
              setOpen(true);
            }}
          >
            <Plus size={16} /> Nouveau signalement
          </button>
        }
      />

      {stats && (
        <div className="discipline-stats" role="group" aria-label="Signalements depuis le début de l'année, par type">
          {stats.byKind.map((k) => (
            <button key={k.kind} type="button" className="chip-stat" aria-pressed={filters.kind === k.kind} onClick={() => { setFilters({ ...filters, kind: filters.kind === k.kind ? "" : k.kind }); setPage(1); }}>
              <strong>{k.count}</strong>
              <span>{k.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="table-toolbar audit-filters">
        <select className="input" aria-label="Type" value={filters.kind} onChange={(e) => { setFilters({ ...filters, kind: e.target.value }); setPage(1); }}>
          <option value="">Tous les types</option>
          {Object.entries(KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Rechercher (élève, matricule, motif…)" aria-label="Rechercher un signalement" value={filters.q} onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} />
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Signalements indisponibles">
            {error}
          </EmptyState>
        ) : !data ? (
          <TableSkeleton columns={5} rows={6} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Scale size={22} />} title={filters.kind || filters.q ? "Aucun signalement ne correspond" : "Aucun signalement"}>
            Les observations et sanctions enregistrées apparaissent ici et dans l&apos;espace des parents.
          </EmptyState>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Élève</th>
                  <th>Type</th>
                  <th>Motif et décision</th>
                  <th>Signalé par</th>
                  <th className="actions">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{new Date(r.date).toLocaleDateString("fr-FR")}</td>
                    <td>
                      <Link className="cell-main" href={`/students/${r.student.id}`}>
                        {r.student.lastName} {r.student.firstName}
                      </Link>
                      <div className="cell-sub">{r.student.enrollments[0]?.class.name ?? "Non affecté"}</div>
                    </td>
                    <td>
                      <span className={`badge ${KINDS[r.kind]?.badge ?? "badge-neutral"}`}>{KINDS[r.kind]?.label ?? r.kind}</span>
                      {!r.visibleToParents && <div className="cell-sub">Note interne</div>}
                    </td>
                    <td className="msg-body">
                      {r.reason}
                      {r.sanction && <div className="cell-sub">Décision : {r.sanction}</div>}
                    </td>
                    <td>{r.reportedByName ?? <span className="muted">—</span>}</td>
                    <td className="actions">
                      {canDelete && (
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Supprimer le signalement du ${new Date(r.date).toLocaleDateString("fr-FR")} pour ${r.student.firstName} ${r.student.lastName}`} onClick={() => remove(r)}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={setPage} unit="signalement" />
          </>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={saving}
        title="Nouveau signalement"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="discipline-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Enregistrer
            </button>
          </>
        }
      >
        <form id="discipline-form" onSubmit={submit}>
          <FormError message={formError} />
          <div className="field">
            <label htmlFor="dc-search" className="required">
              Élève
            </label>
            <input id="dc-search" className="input" type="search" placeholder="Nom, prénom ou matricule…" autoComplete="off" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} />
            <select className="input" aria-label="Élève concerné" required size={5} style={{ marginTop: 6, height: "auto", backgroundImage: "none", paddingRight: 12 }} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              {matches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName} {s.firstName} ({s.matricule})
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="dc-kind">Type</label>
              <select id="dc-kind" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dc-date" className="required">
                Date
              </label>
              <input id="dc-date" type="date" className="input" required max={todayIso()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="dc-reason" className="required">
                Motif
              </label>
              <input id="dc-reason" className="input" required minLength={3} maxLength={200} placeholder="Ex. Bavardages répétés en cours de mathématiques" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="dc-sanction">Décision</label>
              <input id="dc-sanction" className="input" maxLength={300} placeholder="Ex. 2 heures de retenue samedi matin" value={form.sanction} onChange={(e) => setForm({ ...form, sanction: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="dc-desc">Détails (réservés au personnel)</label>
              <textarea id="dc-desc" className="input" rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <label className="checkbox" style={{ display: "flex" }}>
            <input type="checkbox" checked={form.visibleToParents} onChange={(e) => setForm({ ...form, visibleToParents: e.target.checked })} />
            Informer la famille (visible dans l&apos;espace parent ; un SMS part pour une exclusion ou une convocation si l&apos;établissement l&apos;a activé)
          </label>
        </form>
      </Modal>
    </>
  );
}

export default function DisciplinePage() {
  return (
    <Shell title="Vie scolaire">
      <DisciplineContent />
    </Shell>
  );
}
