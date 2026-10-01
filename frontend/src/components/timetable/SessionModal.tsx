"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, LoaderCircle, OctagonAlert, Save, Trash2 } from "lucide-react";
import { Modal, FormError } from "../ui";
import { api, ApiError, errorMessage } from "../../lib/api";
import { Conflict, DAY_NAMES, Resources, Session, durationLabel, fromMinutes, hasBlocking, toMinutes } from "../../lib/timetable";

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
  };
}

const DURATIONS = [30, 45, 55, 60, 90, 120, 180];

function payload(d: SessionDraft, force = false) {
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
    ...(force ? { force: true } : {}),
  };
}

/** Create / edit a lesson with a live conflict check before saving. */
export default function SessionModal({
  open,
  initial,
  resources,
  readOnly,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  initial: SessionDraft | null;
  resources: Resources;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (session: Session, created: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<SessionDraft | null>(initial);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceNeeded, setForceNeeded] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setConflicts(null);
    setError(null);
    setForceNeeded(false);
  }, [initial]);

  const set = (patch: Partial<SessionDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setForceNeeded(false);
  };

  const validTimes = !!draft && /^\d{2}:\d{2}$/.test(draft.startTime) && /^\d{2}:\d{2}$/.test(draft.endTime) && draft.startTime < draft.endTime;

  // Live conflict check, debounced.
  useEffect(() => {
    if (!open || !draft || !draft.classId || !validTimes) {
      setConflicts(null);
      return;
    }
    setChecking(true);
    const controller = new AbortController();
    const t = setTimeout(() => {
      api
        .post<{ conflicts: Conflict[] }>("/timetable/check", { ...payload(draft), id: draft.id })
        .then((r) => !controller.signal.aborted && setConflicts(r.conflicts))
        .catch(() => !controller.signal.aborted && setConflicts(null))
        .finally(() => !controller.signal.aborted && setChecking(false));
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [open, draft, validTimes]);

  const duration = draft && validTimes ? toMinutes(draft.endTime) - toMinutes(draft.startTime) : 0;
  const blocking = hasBlocking(conflicts ?? undefined);
  const teacherOptions = useMemo(() => resources.teachers, [resources]);

  if (!draft) return null;
  const isNew = !draft.id;

  const save = async (force = false) => {
    if (!draft.classId) return setError("Choisissez une classe");
    if (!validTimes) return setError("L'heure de fin doit être après l'heure de début");
    if (!draft.subjectId && !draft.label.trim()) return setError("Choisissez une matière ou saisissez un libellé");
    setSaving(true);
    setError(null);
    try {
      const saved = isNew
        ? await api.post<Session>("/timetable/sessions", payload(draft, force))
        : await api.patch<Session>(`/timetable/sessions/${draft.id}`, payload(draft, force));
      onSaved(saved, isNew);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setForceNeeded(true);
        const body = err.body as { conflicts?: Conflict[] } | undefined;
        if (body?.conflicts) setConflicts(body.conflicts);
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
      const copy = await api.post<Session>(`/timetable/sessions/${draft.id}/duplicate`, {});
      onSaved(copy, true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => draft.id && onDeleted(draft.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title={readOnly ? "Détail de la séance" : isNew ? "Nouvelle séance" : "Modifier la séance"}
      description={validTimes ? `${DAY_NAMES[draft.dayOfWeek]} · ${draft.startTime}–${draft.endTime} · ${durationLabel(draft.startTime, draft.endTime)}` : undefined}
      footer={
        readOnly ? (
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
        ) : (
          <>
            {!isNew && (
              <>
                <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={saving}>
                  <Trash2 size={16} /> Supprimer
                </button>
                <button type="button" className="btn btn-ghost" onClick={duplicate} disabled={saving} title="Copier sur le prochain jour libre aux mêmes horaires">
                  <Copy size={16} /> Dupliquer
                </button>
              </>
            )}
            <span className="spacer" />
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            {forceNeeded ? (
              <button type="button" className="btn btn-danger" onClick={() => save(true)} disabled={saving}>
                <OctagonAlert size={16} /> Enregistrer malgré le conflit
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={saving}>
                {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
                {isNew ? "Créer la séance" : "Enregistrer"}
              </button>
            )}
          </>
        )
      }
    >
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
          </div>
          <div className="field">
            <label htmlFor="s-teacher">Enseignant</label>
            <select id="s-teacher" className="input" value={draft.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
              <option value="">— Non attribué —</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-room">Salle</label>
            <select id="s-room" className="input" value={draft.roomId} onChange={(e) => set({ roomId: e.target.value })}>
              <option value="">— Non attribuée —</option>
              {resources.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.capacity ? ` (${r.capacity} places)` : ""}
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
                // Keep the duration when the start moves.
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
          <div className="field full">
            <label htmlFor="s-label">Libellé {draft.subjectId ? "(optionnel)" : ""}</label>
            <input id="s-label" className="input" value={draft.label} maxLength={80} placeholder="Ex. Étude, Soutien, Club lecture" onChange={(e) => set({ label: e.target.value })} />
          </div>
          <div className="field full">
            <label htmlFor="s-notes">Notes</label>
            <textarea id="s-notes" className="input" style={{ minHeight: 60 }} maxLength={500} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
      </fieldset>

      <div aria-live="polite" style={{ marginTop: 4 }}>
        {checking && (
          <div className="muted" style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <LoaderCircle size={14} className="spin" /> Vérification des disponibilités…
          </div>
        )}
        {!checking && conflicts && conflicts.length === 0 && validTimes && (
          <div className="conflict-ok">
            <CheckCircle2 size={16} /> Créneau libre : classe, enseignant et salle disponibles.
          </div>
        )}
        {!checking && conflicts && conflicts.length > 0 && (
          <div className="conflict-list">
            {conflicts.map((c, i) => (
              <div key={i} className={`conflict-item ${c.severity}`}>
                {c.severity === "error" ? <OctagonAlert size={16} /> : <AlertTriangle size={16} />}
                <span>{c.message}</span>
              </div>
            ))}
            {blocking && !readOnly && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Modifiez l&apos;horaire, l&apos;enseignant ou la salle — ou enregistrez malgré tout : la séance restera signalée en conflit.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
