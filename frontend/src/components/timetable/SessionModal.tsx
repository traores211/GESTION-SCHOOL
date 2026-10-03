"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, CircleMinus, Copy, LoaderCircle, Lock, LockOpen, Save, Trash2, XCircle } from "lucide-react";
import { Modal, FormError } from "../ui";
import { api, ApiError, errorMessage } from "../../lib/api";
import { Check, DAY_NAMES, FormOptions, LessonReport, Resources, Session, clientChecks, durationLabel, formatHours, fromMinutes, toMinutes } from "../../lib/timetable";

export interface SessionDraft {
  id?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
  termId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string;
  notes: string;
  locked?: boolean;
}

export function draftFromSession(s: Session): SessionDraft {
  return {
    id: s.id,
    classId: s.classId,
    subjectId: s.subjectId ?? "",
    teacherId: s.teacherId ?? "",
    roomId: s.roomId ?? "",
    termId: s.termId ?? "",
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    label: s.label ?? "",
    notes: s.notes ?? "",
    locked: !!s.locked,
  };
}

const DURATIONS = [55, 60, 110, 120, 165, 180];

function payload(d: SessionDraft) {
  return {
    classId: d.classId,
    subjectId: d.subjectId || null,
    teacherId: d.teacherId || null,
    roomId: d.roomId || null,
    termId: d.termId || null,
    dayOfWeek: Number(d.dayOfWeek),
    startTime: d.startTime,
    endTime: d.endTime,
    label: d.label.trim() || null,
    notes: d.notes.trim() || null,
  };
}

function CheckIcon({ status }: { status: Check["status"] }) {
  if (status === "ok") return <CheckCircle2 size={16} className="check-ok" aria-label="Respecté" />;
  if (status === "fail") return <XCircle size={16} className="check-fail" aria-label="Non respecté" />;
  return <CircleMinus size={16} className="check-na" aria-label="Sans objet" />;
}

/** Create / edit a lesson. Every rule is checked live by the server and shown as a checklist. */
export default function SessionModal({
  open,
  initial,
  resources,
  readOnly,
  onClose,
  onSaved,
  onDeleted,
  onLockToggle,
  onSwapStart,
}: {
  open: boolean;
  initial: SessionDraft | null;
  resources: Resources;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (session: Session, created: boolean) => void;
  onDeleted: (id: string) => void;
  onLockToggle?: (id: string, locked: boolean) => void;
  onSwapStart?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<SessionDraft | null>(initial);
  const [report, setReport] = useState<LessonReport | null>(null);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [allTeachers, setAllTeachers] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
    setReport(null);
    setOptions(null);
    setError(null);
    setAllTeachers(false);
  }, [initial]);

  const set = (patch: Partial<SessionDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const validTimes = !!draft && /^\d{2}:\d{2}$/.test(draft.startTime) && /^\d{2}:\d{2}$/.test(draft.endTime) && draft.startTime < draft.endTime;
  const duration = draft && validTimes ? toMinutes(draft.endTime) - toMinutes(draft.startTime) : 0;

  // Live server check (the same rules as on save), debounced.
  useEffect(() => {
    if (!open || !draft || !draft.classId || !validTimes || readOnly) {
      setReport(null);
      return;
    }
    setChecking(true);
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .post<LessonReport>("/timetable/check", { ...payload(draft), id: draft.id })
        .then((r) => !cancelled && setReport(r))
        .catch(() => !cancelled && setReport(null))
        .finally(() => !cancelled && setChecking(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, draft, validTimes, readOnly]);

  // Filtered lists: qualified teachers, suitable rooms, free slots of the chosen teacher.
  useEffect(() => {
    if (!open || !draft?.classId || readOnly) return;
    let cancelled = false;
    const q = new URLSearchParams({ classId: draft.classId });
    if (draft.subjectId) q.set("subjectId", draft.subjectId);
    if (draft.teacherId) q.set("teacherId", draft.teacherId);
    if (draft.id) q.set("excludeId", draft.id);
    if (validTimes) {
      q.set("dayOfWeek", String(draft.dayOfWeek));
      q.set("startTime", draft.startTime);
      q.set("endTime", draft.endTime);
      if (duration >= 15) q.set("durationMinutes", String(duration));
    }
    const t = setTimeout(() => {
      api
        .get<FormOptions>(`/timetable/options?${q}`)
        .then((o) => !cancelled && setOptions(o))
        .catch(() => !cancelled && setOptions(null));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, draft?.classId, draft?.subjectId, draft?.teacherId, draft?.id, draft?.dayOfWeek, draft?.startTime, draft?.endTime, validTimes, duration, readOnly]);

  const instant = useMemo(() => (draft ? clientChecks(draft, resources) : []), [draft, resources]);

  const teacherList = useMemo(() => {
    if (!options) return resources.teachers.map((t) => ({ id: t.id, name: t.name, qualified: true, free: null as boolean | null, loadHours: 0, maxHours: null as number | null }));
    return options.teachers.filter((t) => allTeachers || !draft?.subjectId || t.qualified || t.id === draft?.teacherId);
  }, [options, resources.teachers, allTeachers, draft?.subjectId, draft?.teacherId]);

  if (!draft) return null;
  const isNew = !draft.id;
  const blocked = !!report && !report.ok;

  const save = async () => {
    if (!draft.classId) return setError("Choisissez une classe");
    if (!validTimes) return setError("L'heure de fin doit être après l'heure de début");
    if (!draft.subjectId && !draft.label.trim()) return setError("Choisissez une matière ou saisissez un libellé");
    setSaving(true);
    setError(null);
    try {
      const saved = isNew ? await api.post<Session>("/timetable/sessions", payload(draft)) : await api.patch<Session>(`/timetable/sessions/${draft.id}`, payload(draft));
      onSaved(saved, isNew);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as Partial<LessonReport> | undefined;
        if (body?.checks) setReport({ ok: false, checks: body.checks, warnings: body.warnings ?? [] });
      }
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!draft.id) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.post<Session>(`/timetable/sessions/${draft.id}/duplicate`, {}), true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const slotsByDay = new Map<number, FormOptions["freeSlots"]>();
  for (const s of options?.freeSlots ?? []) slotsByDay.set(s.dayOfWeek, [...(slotsByDay.get(s.dayOfWeek) ?? []), s]);
  const subjectName = resources.subjects.find((s) => s.id === draft.subjectId)?.name;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="xl"
      title={readOnly ? "Détail du cours" : isNew ? "Nouveau cours" : "Modifier le cours"}
      description={validTimes ? `${DAY_NAMES[draft.dayOfWeek]} · ${draft.startTime}–${draft.endTime} · ${durationLabel(draft.startTime, draft.endTime)}${draft.locked ? " · verrouillé" : ""}` : undefined}
      footer={
        readOnly ? (
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
        ) : (
          <>
            {!isNew && (
              <>
                <button type="button" className="btn btn-danger-ghost" onClick={() => draft.id && onDeleted(draft.id)} disabled={saving}>
                  <Trash2 size={16} /> Supprimer
                </button>
                <button type="button" className="btn btn-ghost" onClick={duplicate} disabled={saving} title="Copier sur le prochain jour possible aux mêmes horaires">
                  <Copy size={16} /> Dupliquer
                </button>
                {onSwapStart && (
                  <button type="button" className="btn btn-ghost" onClick={() => draft.id && onSwapStart(draft.id)} disabled={saving} title="Choisir ensuite le cours avec lequel échanger">
                    <ArrowLeftRight size={16} /> Échanger
                  </button>
                )}
                {onLockToggle && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (!draft.id) return;
                      onLockToggle(draft.id, !draft.locked);
                      set({ locked: !draft.locked });
                    }}
                    disabled={saving}
                    title="Un cours verrouillé n'est jamais modifié par la génération automatique"
                  >
                    {draft.locked ? <LockOpen size={16} /> : <Lock size={16} />} {draft.locked ? "Déverrouiller" : "Verrouiller"}
                  </button>
                )}
              </>
            )}
            <span className="spacer" />
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || blocked} title={blocked ? "Corrigez d'abord les contrôles en rouge" : undefined}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
              {isNew ? "Créer le cours" : "Enregistrer"}
            </button>
          </>
        )
      }
    >
      <div className="lesson-form">
        <fieldset disabled={readOnly || saving} style={{ border: "none" }}>
          <FormError message={error} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="s-class" className="required">
                Classe
              </label>
              <select id="s-class" className="input" value={draft.classId} onChange={(e) => set({ classId: e.target.value })} required>
                <option value="">— Choisir —</option>
                {resources.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-subject">Matière</label>
              <select id="s-subject" className="input" value={draft.subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
                <option value="">— Aucune (libellé libre) —</option>
                {resources.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {options?.volume && subjectName && (
                <span className="field-hint tabular">
                  {subjectName} : {formatHours(options.volume.plannedHours)} déjà planifiées / {formatHours(options.volume.officialHours)} officielles
                  {options.volume.maxSessionHours ? ` · séance de ${formatHours(options.volume.maxSessionHours)} max.` : ""}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="s-teacher">Professeur</label>
              <select id="s-teacher" className="input" value={draft.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
                <option value="">— Non attribué —</option>
                {teacherList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {options ? ` — ${formatHours(t.loadHours)}${t.maxHours != null ? ` / ${formatHours(t.maxHours)}` : ""}` : ""}
                    {!t.qualified ? " (non habilité)" : ""}
                    {t.free === false ? " (indisponible)" : ""}
                  </option>
                ))}
              </select>
              {draft.subjectId && options && (
                <label className="check-inline">
                  <input type="checkbox" checked={allTeachers} onChange={(e) => setAllTeachers(e.target.checked)} /> Afficher aussi les professeurs non habilités
                </label>
              )}
              {draft.subjectId && options && !options.teachers.some((t) => t.qualified) && (
                <span className="field-hint" style={{ color: "var(--danger)" }}>
                  Aucun professeur n&apos;est habilité pour cette matière à ce niveau : importez les habilitations (Professeurs & volumes).
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="s-room">Salle</label>
              <select id="s-room" className="input" value={draft.roomId} onChange={(e) => set({ roomId: e.target.value })}>
                <option value="">— Non attribuée —</option>
                {(options?.rooms ?? resources.rooms.map((r) => ({ id: r.id, name: r.name, suitable: true, free: null, reason: null }))).map((r) => (
                  <option key={r.id} value={r.id} disabled={!r.suitable && r.id !== draft.roomId}>
                    {r.name}
                    {!r.suitable ? " (inadaptée)" : r.free === false ? " (occupée)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-day" className="required">
                Jour
              </label>
              <select id="s-day" className="input" value={draft.dayOfWeek} onChange={(e) => set({ dayOfWeek: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {DAY_NAMES[d]}
                    {resources.settings.days.includes(d) ? "" : " (fermé)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-term">Période</label>
              <select id="s-term" className="input" value={draft.termId} onChange={(e) => set({ termId: e.target.value })}>
                <option value="">Toute l&apos;année</option>
                {resources.terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-start" className="required">
                Début
              </label>
              <input
                id="s-start"
                type="time"
                step={300}
                className="input"
                value={draft.startTime}
                onChange={(e) => {
                  const start = e.target.value;
                  const keep = duration > 0 && /^\d{2}:\d{2}$/.test(start) ? fromMinutes(toMinutes(start) + duration) : draft.endTime;
                  set({ startTime: start, endTime: keep });
                }}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="s-end" className="required">
                Fin
              </label>
              <input id="s-end" type="time" step={300} className="input" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} aria-invalid={!validTimes} required />
              {!readOnly && (
                <div className="btn-row" aria-label="Durées rapides">
                  {DURATIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-sm ${duration === m ? "btn-secondary" : "btn-outline"}`}
                      style={{ minHeight: 26, padding: "2px 8px", fontSize: 11.5 }}
                      onClick={() => /^\d{2}:\d{2}$/.test(draft.startTime) && set({ endTime: fromMinutes(toMinutes(draft.startTime) + m) })}
                    >
                      {durationLabel("00:00", fromMinutes(m))}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!readOnly && draft.teacherId && options && (
              <div className="field full">
                <span className="field-label">Créneaux libres du professeur pour cette classe ({durationLabel("00:00", fromMinutes(duration || resources.settings.slotMinutes))})</span>
                {options.freeSlots.length === 0 ? (
                  <span className="field-hint">Aucun créneau libre commun à la classe et au professeur.</span>
                ) : (
                  <div className="free-slots">
                    {[...slotsByDay.entries()].map(([day, slots]) => (
                      <div key={day} className="free-slots-day">
                        <span className="free-slots-label">{DAY_NAMES[day].slice(0, 3)}</span>
                        {slots.map((s) => {
                          const active = s.dayOfWeek === draft.dayOfWeek && s.startTime === draft.startTime;
                          return (
                            <button
                              key={s.startTime}
                              type="button"
                              className={`chip${active ? " is-active" : ""}`}
                              aria-pressed={active}
                              onClick={() => set({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })}
                            >
                              {s.startTime}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="field full">
              <label htmlFor="s-label">Libellé {draft.subjectId ? "(optionnel)" : ""}</label>
              <input id="s-label" className="input" value={draft.label} maxLength={80} placeholder="Ex. Étude, Soutien, Club lecture" onChange={(e) => set({ label: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="s-notes">Notes</label>
              <textarea id="s-notes" className="input" style={{ minHeight: 52 }} maxLength={500} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
        </fieldset>

        {!readOnly && (
          <aside className="checklist" aria-live="polite" aria-label="Contrôles avant enregistrement">
            <div className="checklist-head">
              <strong>Contrôles</strong>
              {checking ? (
                <span className="muted">
                  <LoaderCircle size={13} className="spin" /> vérification…
                </span>
              ) : report ? (
                <span className={report.ok ? "check-ok" : "check-fail"}>{report.ok ? "Tout est conforme" : `${report.checks.filter((c) => c.status === "fail").length} point(s) bloquant(s)`}</span>
              ) : null}
            </div>
            {!report && instant.length > 0 && (
              <ul className="checklist-items">
                {instant.map((i, k) => (
                  <li key={k} className="is-fail">
                    <XCircle size={16} className="check-fail" />
                    <span>{i.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {report && (
              <ul className="checklist-items">
                {report.checks.map((c) => (
                  <li key={c.id} className={`is-${c.status}`}>
                    <CheckIcon status={c.status} />
                    <span>
                      {c.label}
                      {c.detail && <small>{c.detail}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {report && report.warnings.length > 0 && (
              <ul className="checklist-items checklist-warnings">
                {report.warnings.map((w, k) => (
                  <li key={k} className="is-warning">
                    <AlertTriangle size={16} className="check-warn" />
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {!report && !instant.length && !checking && <p className="muted" style={{ fontSize: 12.5 }}>Choisissez une classe et un horaire pour lancer les contrôles.</p>}
          </aside>
        )}
      </div>
    </Modal>
  );
}
