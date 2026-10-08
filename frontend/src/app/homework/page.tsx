"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

interface Option {
  id: string;
  name: string;
}

interface HomeworkRow {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdByName: string | null;
  class: Option;
  subject: Option | null;
}

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function HomeworkContent() {
  const feedback = useFeedback();
  const [classes, setClasses] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [classId, setClassId] = useState("");
  const [rows, setRows] = useState<HomeworkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subjectId: "", title: "", description: "", dueDate: inDays(2) });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Option[]>("/classes"), api.get<Option[]>("/subjects")])
      .then(([cls, subs]) => {
        setClasses(cls);
        setSubjects(subs);
        if (cls[0]) setClassId(cls[0].id);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const load = useCallback(() => {
    if (!classId) return;
    setRows(null);
    api
      .get<HomeworkRow[]>(`/homework?classId=${classId}`)
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [classId]);
  useEffect(load, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/homework", { classId, subjectId: form.subjectId || undefined, title: form.title, description: form.description || undefined, dueDate: form.dueDate });
      feedback.success("Devoir ajouté au cahier de textes", "Les parents de la classe le voient dans leur espace.");
      setOpen(false);
      setForm({ subjectId: form.subjectId, title: "", description: "", dueDate: inDays(2) });
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (h: HomeworkRow) => {
    const yes = await feedback.confirm({ title: "Supprimer ce devoir ?", message: h.title, confirmLabel: "Supprimer", tone: "danger" });
    if (!yes) return;
    try {
      await api.delete(`/homework/${h.id}`);
      load();
    } catch (err) {
      feedback.error("Suppression impossible", errorMessage(err));
    }
  };

  const today = new Date(new Date().toDateString());

  return (
    <>
      <PageHeader
        title="Cahier de textes"
        description="Le travail donné à chaque classe et sa date de remise. Les parents le consultent dans leur espace."
        actions={
          <button className="btn btn-primary" disabled={!classId} onClick={() => { setFormError(null); setOpen(true); }}>
            <Plus size={16} /> Donner un devoir
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-item">
          <label htmlFor="hw-class">Classe</label>
          <select id="hw-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Cahier de textes indisponible">
            {error}
          </EmptyState>
        ) : !rows ? (
          <TableSkeleton columns={4} rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<BookOpenCheck size={22} />} title="Aucun devoir en cours pour cette classe">
            Les devoirs remis depuis plus de deux semaines ne sont plus affichés.
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Pour le</th>
                <th>Matière</th>
                <th>Travail à faire</th>
                <th>Donné par</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td className="nowrap">
                    {new Date(h.dueDate).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    {new Date(h.dueDate) < today && <div className="cell-sub">passé</div>}
                  </td>
                  <td>{h.subject?.name ?? <span className="muted">—</span>}</td>
                  <td className="msg-body">
                    <div className="cell-main">{h.title}</div>
                    {h.description && <div className="cell-sub">{h.description}</div>}
                  </td>
                  <td>{h.createdByName ?? <span className="muted">—</span>}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Supprimer le devoir « ${h.title} »`} onClick={() => remove(h)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={saving}
        title="Donner un devoir"
        description={classes.find((c) => c.id === classId)?.name}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="hw-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Ajouter
            </button>
          </>
        }
      >
        <form id="hw-form" onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="hw-subject">Matière</label>
              <select id="hw-subject" className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">— Aucune —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="hw-due" className="required">
                À rendre le
              </label>
              <input id="hw-due" type="date" className="input" required min={inDays(0)} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="hw-title" className="required">
                Travail à faire
              </label>
              <input id="hw-title" className="input" required minLength={3} maxLength={160} placeholder="Ex. Exercices 4 à 7 page 52" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="hw-desc">Consignes</label>
              <textarea id="hw-desc" className="input" rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

export default function HomeworkPage() {
  return (
    <Shell title="Cahier de textes">
      <HomeworkContent />
    </Shell>
  );
}
