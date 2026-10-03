"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Clock, DoorOpen, History, LoaderCircle, Pencil, Plus, Save, Trash2, Undo2 } from "lucide-react";
import Shell from "../../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, TableSkeleton, useFeedback } from "../../../components/ui";
import { api, errorMessage } from "../../../lib/api";
import { getStoredUser } from "../../../lib/auth";
import { DAY_NAMES, TimetableSettings, parseHalfDays, subjectColor } from "../../../lib/timetable";
import TimetableNav from "../../../components/timetable/TimetableNav";
import "../../../components/timetable/timetable.css";

type Tab = "rooms" | "subjects" | "hours" | "imports";

interface Room {
  id: string;
  name: string;
  type: string | null;
  capacity: number | null;
  building: string | null;
  subjectIds?: string[];
  subjects?: { id: string; name: string }[];
  _count: { sessions: number };
}

interface Subject {
  id: string;
  name: string;
  code: string;
  coefficient: number;
  color: string | null;
}

interface ImportRecord {
  id: string;
  fileName: string;
  fileType: string;
  method: string;
  sessionCount: number;
  conflictCount: number;
  createdAt: string;
  _count: { sessions: number };
}

const TABS: { id: Tab; label: string; icon: typeof DoorOpen }[] = [
  { id: "rooms", label: "Salles", icon: DoorOpen },
  { id: "subjects", label: "Matières", icon: BookOpen },
  { id: "hours", label: "Jours & horaires", icon: Clock },
  { id: "imports", label: "Historique des imports", icon: History },
];

const ROOM_TYPES = ["Salle de classe", "Laboratoire", "Salle informatique", "Amphithéâtre", "Terrain", "Gymnase", "CDI / Bibliothèque", "Atelier"];
const COLORS = ["#3d5a80", "#a1472a", "#5b4a8b", "#4f6141", "#b07a12", "#2f7a78", "#9e2b4f", "#3c6e9e", "#7a6a2e", "#8a4f7d", "#2e6b4f", "#b85c1e"];
const MANAGEMENT = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];

// ------------------------------------------------------------------ rooms

function RoomsTab() {
  const feedback = useFeedback();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editing, setEditing] = useState<Partial<Room> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Room[]>("/timetable/rooms").then(setRooms).catch((err) => feedback.error("Chargement impossible", errorMessage(err)));
  }, [feedback]);
  useEffect(load, [load]);
  useEffect(() => {
    api.get<Subject[]>("/subjects").then(setSubjects).catch(() => setSubjects([]));
  }, []);
  const toggleSubject = (id: string) => {
    if (!editing) return;
    const current = new Set(editing.subjectIds ?? []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    setEditing({ ...editing, subjectIds: [...current] });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    const body = {
      name: editing.name?.trim(),
      type: editing.type || null,
      capacity: editing.capacity ? Number(editing.capacity) : null,
      building: editing.building?.trim() || null,
      subjectIds: editing.subjectIds ?? [],
    };
    try {
      if (editing.id) await api.patch(`/timetable/rooms/${editing.id}`, body);
      else await api.post("/timetable/rooms", body);
      feedback.success(editing.id ? "Salle modifiée" : "Salle ajoutée", body.name);
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (room: Room) => {
    const ok = await feedback.confirm({
      title: `Supprimer « ${room.name} » ?`,
      message: room._count.sessions
        ? `${room._count.sessions} séance(s) utilisent cette salle : elles seront conservées mais sans salle.`
        : "Cette salle n'est utilisée par aucune séance.",
      confirmLabel: "Supprimer la salle",
    });
    if (!ok) return;
    try {
      await api.delete(`/timetable/rooms/${room.id}`);
      feedback.success("Salle supprimée");
      load();
    } catch (err) {
      feedback.error("Suppression impossible", errorMessage(err));
    }
  };

  return (
    <>
      <div className="table-toolbar">
        <p className="muted" style={{ fontSize: 13 }}>
          Les salles permettent de détecter les doubles réservations et d&apos;afficher leur occupation.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ type: "Salle de classe" })}>
          <Plus size={16} /> Ajouter une salle
        </button>
      </div>
      <div className="table-wrap">
        {!rooms ? (
          <TableSkeleton columns={5} rows={4} />
        ) : rooms.length === 0 ? (
          <EmptyState icon={<DoorOpen size={22} />} title="Aucune salle" action={<button className="btn btn-primary" onClick={() => setEditing({ type: "Salle de classe" })}><Plus size={16} /> Ajouter une salle</button>}>
            Ajoutez vos salles de classe, laboratoires et terrains.
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Salle</th>
                <th>Type</th>
                <th>Réservée à</th>
                <th className="num">Capacité</th>
                <th className="num">Séances / semaine</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-main">{r.name}</div>
                    {r.building && <div className="cell-sub">{r.building}</div>}
                  </td>
                  <td>{r.type ?? <span className="muted">—</span>}</td>
                  <td>{r.subjects?.length ? r.subjects.map((s) => s.name).join(", ") : <span className="muted">Toutes matières</span>}</td>
                  <td className="num">{r.capacity ?? "—"}</td>
                  <td className="num">{r._count.sessions}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Modifier ${r.name}`} onClick={() => setEditing(r)}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="btn btn-danger-ghost btn-icon btn-sm" aria-label={`Supprimer ${r.name}`} onClick={() => remove(r)}>
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
        open={!!editing}
        onClose={() => setEditing(null)}
        busy={saving}
        title={editing?.id ? "Modifier la salle" : "Nouvelle salle"}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="room-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Enregistrer
            </button>
          </>
        }
      >
        {editing && (
          <form id="room-form" onSubmit={save}>
            <FormError message={error} />
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="room-name" className="required">
                  Nom
                </label>
                <input id="room-name" className="input" required maxLength={60} placeholder="Ex. Salle 12, Labo SVT" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="room-type">Type</label>
                <select id="room-type" className="input" value={editing.type ?? ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                  <option value="">—</option>
                  {ROOM_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="room-capacity">Capacité</label>
                <input id="room-capacity" type="number" min={1} max={2000} className="input" value={editing.capacity ?? ""} onChange={(e) => setEditing({ ...editing, capacity: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="field full">
                <label htmlFor="room-building">Bâtiment / emplacement</label>
                <input id="room-building" className="input" maxLength={60} value={editing.building ?? ""} onChange={(e) => setEditing({ ...editing, building: e.target.value })} />
              </div>
              <div className="field full">
                <span className="field-label">Salle spécialisée pour</span>
                <div className="btn-row" role="group" aria-label="Matières de la salle spécialisée">
                  {subjects.map((s) => {
                    const on = (editing.subjectIds ?? []).includes(s.id);
                    return (
                      <button key={s.id} type="button" className={`chip${on ? " is-active" : ""}`} aria-pressed={on} onClick={() => toggleSubject(s.id)}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                <span className="field-hint">Laissez vide pour une salle ordinaire. Une salle spécialisée (labo, informatique, EPS) n&apos;accueille que ces matières, et ces matières doivent y avoir lieu.</span>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ subjects

function SubjectsTab({ canManage }: { canManage: boolean }) {
  const feedback = useFeedback();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [editing, setEditing] = useState<Partial<Subject> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Subject[]>("/subjects").then(setSubjects).catch((err) => feedback.error("Chargement impossible", errorMessage(err)));
  }, [feedback]);
  useEffect(load, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    const body = { name: editing.name?.trim(), code: editing.code?.trim().toUpperCase(), coefficient: Number(editing.coefficient) || 1, ...(editing.color ? { color: editing.color } : {}) };
    try {
      if (editing.id) await api.patch(`/subjects/${editing.id}`, body);
      else await api.post("/subjects", body);
      feedback.success(editing.id ? "Matière modifiée" : "Matière ajoutée", body.name);
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Subject) => {
    const ok = await feedback.confirm({
      title: `Supprimer la matière « ${s.name} » ?`,
      message: "Les notes saisies dans cette matière seront aussi supprimées. Les séances de l'emploi du temps perdront leur matière. Cette action est irréversible.",
      confirmLabel: "Supprimer définitivement",
    });
    if (!ok) return;
    try {
      await api.delete(`/subjects/${s.id}`);
      feedback.success("Matière supprimée");
      load();
    } catch (err) {
      feedback.error("Suppression impossible", errorMessage(err));
    }
  };

  return (
    <>
      <div className="table-toolbar">
        <p className="muted" style={{ fontSize: 13 }}>
          La couleur d&apos;une matière est utilisée dans tous les emplois du temps.
        </p>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ coefficient: 1 })}>
            <Plus size={16} /> Ajouter une matière
          </button>
        )}
      </div>
      <div className="table-wrap">
        {!subjects ? (
          <TableSkeleton columns={4} rows={5} />
        ) : subjects.length === 0 ? (
          <EmptyState icon={<BookOpen size={22} />} title="Aucune matière">
            Ajoutez les matières enseignées dans l&apos;établissement.
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Matière</th>
                <th>Code</th>
                <th className="num">Coefficient</th>
                {canManage && (
                  <th className="actions">
                    <span className="visually-hidden">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 4, background: subjectColor(s) }} aria-hidden="true" />
                      <span className="cell-main">{s.name}</span>
                    </span>
                  </td>
                  <td>
                    <code>{s.code}</code>
                  </td>
                  <td className="num">{s.coefficient}</td>
                  {canManage && (
                    <td className="actions">
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Modifier ${s.name}`} onClick={() => setEditing(s)}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="btn btn-danger-ghost btn-icon btn-sm" aria-label={`Supprimer ${s.name}`} onClick={() => remove(s)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        busy={saving}
        title={editing?.id ? "Modifier la matière" : "Nouvelle matière"}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="subject-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Enregistrer
            </button>
          </>
        }
      >
        {editing && (
          <form id="subject-form" onSubmit={save}>
            <FormError message={error} />
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="sub-name" className="required">
                  Nom
                </label>
                <input id="sub-name" className="input" required value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="sub-code" className="required">
                  Code
                </label>
                <input id="sub-code" className="input" required maxLength={10} placeholder="MATH" value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="sub-coef">Coefficient</label>
                <input id="sub-coef" type="number" min={1} max={20} className="input" value={editing.coefficient ?? 1} onChange={(e) => setEditing({ ...editing, coefficient: Number(e.target.value) })} />
              </div>
              <div className="field full">
                <span className="field-label">Couleur dans l&apos;emploi du temps</span>
                <div className="color-swatches" role="group" aria-label="Couleur">
                  {COLORS.map((c) => (
                    <button key={c} type="button" className="color-swatch" style={{ background: c }} aria-label={c} aria-pressed={(editing.color ?? subjectColor({ name: editing.name ?? "" })) === c} onClick={() => setEditing({ ...editing, color: c })} />
                  ))}
                </div>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ days & hours

function HoursTab() {
  const feedback = useFeedback();
  const [settings, setSettings] = useState<TimetableSettings | null>(null);
  const [breaks, setBreaks] = useState("");
  const [halfDays, setHalfDays] = useState<Set<string>>(new Set());
  const [yearName, setYearName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySettings = (s: TimetableSettings) => {
    setSettings(s);
    setBreaks(s.breaks.map((b) => `${b.start}-${b.end}`).join(", "));
    setHalfDays(new Set(parseHalfDays(s.freeHalfDays).map((h) => `${h.day}:${h.half}`)));
  };

  useEffect(() => {
    api
      .get<TimetableSettings>("/timetable/settings")
      .then(applySettings)
      .catch((err) => setError(errorMessage(err)));
    api
      .get<{ academicYear: { name: string } }>("/timetable/resources")
      .then((r) => setYearName(r.academicYear.name))
      .catch(() => {});
  }, []);

  if (!settings) return <div className="card"><TableSkeleton rows={3} columns={3} /></div>;

  const toggleDay = (d: number) => setSettings({ ...settings, days: settings.days.includes(d) ? settings.days.filter((x) => x !== d) : [...settings.days, d].sort() });
  const toggleHalf = (key: string) =>
    setHalfDays((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.patch<TimetableSettings>("/timetable/settings", {
        days: settings.days,
        start: settings.start,
        end: settings.end,
        breaks,
        slotMinutes: settings.slotMinutes,
        halfDaySplit: settings.halfDaySplit,
        freeHalfDays: [...halfDays].map((k) => ({ day: Number(k.split(":")[0]), half: k.split(":")[1] })),
        maxClassHoursPerDay: settings.maxClassHoursPerDay ?? null,
        maxTeacherHoursPerDay: settings.maxTeacherHoursPerDay ?? null,
      });
      applySettings(saved);
      feedback.success("Grille horaire enregistrée", "Elle s'applique à la saisie, aux contrôles et à la génération.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={save} style={{ maxWidth: 760 }}>
      <FormError message={error} />
      {yearName && (
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Grille de l&apos;année <strong>{yearName}</strong> : elle sert à la saisie, aux contrôles de chaque cours et à la génération automatique.
        </p>
      )}
      <div className="field">
        <span className="field-label">Jours de cours</span>
        <div className="btn-row" role="group" aria-label="Jours de cours">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button key={d} type="button" className={`btn btn-sm ${settings.days.includes(d) ? "btn-secondary" : "btn-outline"}`} aria-pressed={settings.days.includes(d)} onClick={() => toggleDay(d)}>
              {DAY_NAMES[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="h-start">Début de journée</label>
          <input id="h-start" type="time" className="input" value={settings.start} onChange={(e) => setSettings({ ...settings, start: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="h-end">Fin de journée</label>
          <input id="h-end" type="time" className="input" value={settings.end} onChange={(e) => setSettings({ ...settings, end: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="h-slot">Durée d&apos;un créneau</label>
          <select id="h-slot" className="input" value={settings.slotMinutes} onChange={(e) => setSettings({ ...settings, slotMinutes: Number(e.target.value) })}>
            {[15, 20, 30, 45, 50, 55, 60].map((m) => (
              <option key={m} value={m}>
                {m} min{m >= 45 ? " = 1 h de cours" : ""}
              </option>
            ))}
          </select>
          <span className="field-hint">Avec des créneaux de 45 à 60 min, un créneau compte pour une heure du volume officiel.</span>
        </div>
        <div className="field">
          <label htmlFor="h-split">Fin de la matinée</label>
          <input id="h-split" type="time" className="input" value={settings.halfDaySplit ?? "12:00"} onChange={(e) => setSettings({ ...settings, halfDaySplit: e.target.value })} />
          <span className="field-hint">Sépare matin et après-midi (demi-journées libres, matières à fort coefficient le matin).</span>
        </div>
        <div className="field full">
          <label htmlFor="h-breaks">Pauses, récréations et déjeuner</label>
          <input id="h-breaks" className="input" value={breaks} placeholder="09:20-09:35, 12:20-14:30" onChange={(e) => setBreaks(e.target.value)} />
          <span className="field-hint">Séparées par des virgules. Aucun cours ne peut y être placé.</span>
        </div>
        <div className="field full">
          <span className="field-label">Demi-journées libres</span>
          <div className="btn-row" role="group" aria-label="Demi-journées libres">
            {settings.days.flatMap((d) =>
              (["AM", "PM"] as const).map((h) => {
                const key = `${d}:${h}`;
                const on = halfDays.has(key);
                return (
                  <button key={key} type="button" className={`btn btn-sm ${on ? "btn-secondary" : "btn-outline"}`} aria-pressed={on} onClick={() => toggleHalf(key)}>
                    {DAY_NAMES[d]} {h === "AM" ? "matin" : "après-midi"}
                  </button>
                );
              }),
            )}
          </div>
          <span className="field-hint">Exemple : mercredi après-midi. Aucun cours n&apos;y est accepté.</span>
        </div>
        <div className="field">
          <label htmlFor="h-max-class">Maximum par jour pour une classe</label>
          <input
            id="h-max-class"
            type="number"
            min={1}
            max={14}
            className="input"
            placeholder="Sans limite"
            value={settings.maxClassHoursPerDay ?? ""}
            onChange={(e) => setSettings({ ...settings, maxClassHoursPerDay: e.target.value ? Number(e.target.value) : null })}
          />
          <span className="field-hint">En heures de cours.</span>
        </div>
        <div className="field">
          <label htmlFor="h-max-teacher">Maximum par jour pour un professeur</label>
          <input
            id="h-max-teacher"
            type="number"
            min={1}
            max={14}
            className="input"
            placeholder="Sans limite"
            value={settings.maxTeacherHoursPerDay ?? ""}
            onChange={(e) => setSettings({ ...settings, maxTeacherHoursPerDay: e.target.value ? Number(e.target.value) : null })}
          />
          <span className="field-hint">En heures de cours.</span>
        </div>
      </div>
      <div className="btn-row end">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Enregistrer
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ import history

const METHOD_LABELS: Record<string, string> = { list: "Liste", grid: "Grille", text: "Texte", ai: "IA" };

function ImportsTab() {
  const feedback = useFeedback();
  const [imports, setImports] = useState<ImportRecord[] | null>(null);
  const load = useCallback(() => {
    api.get<ImportRecord[]>("/timetable/imports").then(setImports).catch(() => setImports([]));
  }, []);
  useEffect(load, [load]);

  const undo = async (imp: ImportRecord) => {
    const ok = await feedback.confirm({
      title: "Annuler cet import ?",
      message: `Les ${imp._count.sessions} séance(s) créées par « ${imp.fileName} » seront supprimées, y compris celles modifiées depuis. Les salles, classes et matières créées pendant l'import sont conservées, et les séances qu'il avait remplacées ne sont pas restaurées.`,
      confirmLabel: "Annuler l'import",
    });
    if (!ok) return;
    try {
      const r = await api.delete<{ deletedSessions: number }>(`/timetable/imports/${imp.id}`);
      feedback.success("Import annulé", `${r.deletedSessions} séance(s) supprimée(s)`);
      load();
    } catch (err) {
      feedback.error("Annulation impossible", errorMessage(err));
    }
  };

  return (
    <div className="table-wrap">
      {!imports ? (
        <TableSkeleton columns={5} rows={3} />
      ) : imports.length === 0 ? (
        <EmptyState icon={<History size={22} />} title="Aucun import">
          Les fichiers importés apparaîtront ici ; chaque import peut être annulé d&apos;un clic.
        </EmptyState>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fichier</th>
              <th>Date</th>
              <th>Lecture</th>
              <th className="num">Séances</th>
              <th className="num">Conflits à l&apos;import</th>
              <th className="actions">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {imports.map((imp) => (
              <tr key={imp.id}>
                <td>
                  <div className="cell-main">{imp.fileName}</div>
                  <div className="cell-sub">{imp.fileType.toUpperCase()}</div>
                </td>
                <td className="nowrap">{new Date(imp.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td>{imp.method.split("+").map((m) => (m === "requirements" ? "génération" : METHOD_LABELS[m] ?? m)).join(" + ")}</td>
                <td className="num">{imp._count.sessions}</td>
                <td className="num">{imp.conflictCount ? <span className="badge badge-danger">{imp.conflictCount}</span> : "0"}</td>
                <td className="actions">
                  <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => undo(imp)}>
                    <Undo2 size={15} /> Annuler
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ManageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "rooms";
  const canManageSubjects = MANAGEMENT.includes(getStoredUser()?.role ?? "");

  return (
    <>
      <PageHeader
        title="Salles, matières & horaires"
        description="Les ressources utilisées par les emplois du temps et la détection des conflits."
        breadcrumbs={[{ label: "Emplois du temps", href: "/timetable" }, { label: "Paramètres" }]}
      />
      <TimetableNav />
      <div className="tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => router.replace(`/timetable/manage?tab=${id}`, { scroll: false })}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" key={tab} className="page-enter">
        {tab === "rooms" && <RoomsTab />}
        {tab === "subjects" && <SubjectsTab canManage={canManageSubjects} />}
        {tab === "hours" && <HoursTab />}
        {tab === "imports" && <ImportsTab />}
      </div>
    </>
  );
}

export default function TimetableManagePage() {
  return (
    <Shell title="Emplois du temps · Paramètres">
      <Suspense fallback={null}>
        <ManageContent />
      </Suspense>
    </Shell>
  );
}
