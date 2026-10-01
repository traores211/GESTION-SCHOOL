"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, CalendarRange, DoorOpen, FileUp, GraduationCap, Plus, Settings2, UserRound } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, Modal, PageHeader, useFeedback } from "../../components/ui";
import TimetableGrid, { SlotChange } from "../../components/timetable/TimetableGrid";
import SessionModal, { SessionDraft, draftFromSession } from "../../components/timetable/SessionModal";
import { api, ApiError, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import {
  Conflict,
  DAY_NAMES,
  EDITOR_ROLES,
  Resources,
  Session,
  ViewMode,
  fromMinutes,
  gridBounds,
  hasBlocking,
  sessionTitle,
  toMinutes,
  visibleDays,
} from "../../lib/timetable";

const VIEWS: { mode: ViewMode; label: string; icon: typeof GraduationCap }[] = [
  { mode: "class", label: "Classe", icon: GraduationCap },
  { mode: "teacher", label: "Enseignant", icon: UserRound },
  { mode: "room", label: "Salle", icon: DoorOpen },
];

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

function TimetableEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const feedback = useFeedback();
  const narrow = useIsNarrow();
  const role = getStoredUser()?.role ?? "";
  const canEdit = EDITOR_ROLES.includes(role);

  const [resources, setResources] = useState<Resources | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<SessionDraft | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [allConflicts, setAllConflicts] = useState<Session[] | null>(null);

  const view = (params.get("view") as ViewMode) || "class";
  const entityId = params.get("id") || "";
  const termId = params.get("term") || "";
  const dayParam = Number(params.get("day")) || 0;
  const highlight = params.get("highlight");

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`/timetable?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  useEffect(() => {
    api
      .get<Resources>("/timetable/resources")
      .then(setResources)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // Default selection: a teacher sees their own timetable, others the first class.
  useEffect(() => {
    if (!resources || entityId) return;
    if (resources.me.teacherId && !canEdit) setParams({ view: "teacher", id: resources.me.teacherId });
    else if (view === "class" && resources.classes[0]) setParams({ id: resources.classes[0].id });
    else if (view === "teacher" && resources.teachers[0]) setParams({ id: resources.teachers[0].id });
    else if (view === "room" && resources.rooms[0]) setParams({ id: resources.rooms[0].id });
  }, [resources, entityId, view, canEdit, setParams]);

  const load = useCallback(() => {
    if (!entityId) return;
    const q = new URLSearchParams();
    q.set(view === "class" ? "classId" : view === "teacher" ? "teacherId" : "roomId", entityId);
    if (termId) q.set("termId", termId);
    api
      .get<{ sessions: Session[] }>(`/timetable/sessions?${q}`)
      .then((r) => {
        setSessions(r.sessions);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [entityId, view, termId]);

  useEffect(() => {
    setSessions(null);
    load();
  }, [load]);

  const loadConflicts = useCallback(() => {
    api
      .get<{ sessions: Session[] }>("/timetable/conflicts")
      .then((r) => setAllConflicts(r.sessions))
      .catch(() => setAllConflicts([]));
  }, []);
  useEffect(() => {
    if (resources) loadConflicts();
  }, [resources, loadConflicts]);

  const entities = useMemo(() => {
    if (!resources) return [];
    if (view === "class") return resources.classes.map((c) => ({ id: c.id, name: c.name, hint: `${c.studentCount} élèves` }));
    if (view === "teacher") return resources.teachers.map((t) => ({ id: t.id, name: t.name, hint: t.position }));
    return resources.rooms.map((r) => ({ id: r.id, name: r.name, hint: r.type ?? "" }));
  }, [resources, view]);

  const allDays = useMemo(() => (resources && sessions ? visibleDays(resources.settings, sessions) : []), [resources, sessions]);
  const dayMode = narrow || dayParam > 0;
  const currentDay = dayParam && allDays.includes(dayParam) ? dayParam : allDays.includes(((new Date().getDay() + 6) % 7) + 1) ? ((new Date().getDay() + 6) % 7) + 1 : allDays[0];
  const days = dayMode && currentDay ? [currentDay] : allDays;
  const bounds = useMemo(() => (resources && sessions ? gridBounds(resources.settings, sessions) : { start: 420, end: 1080 }), [resources, sessions]);

  const blockingCount = allConflicts?.filter((s) => hasBlocking(s.conflicts)).length ?? 0;
  const viewBlocking = sessions?.filter((s) => hasBlocking(s.conflicts)).length ?? 0;
  const totalMinutes = sessions?.reduce((sum, s) => sum + toMinutes(s.endTime) - toMinutes(s.startTime), 0) ?? 0;

  const refreshAfterChange = () => {
    load();
    loadConflicts();
  };

  // ---------------------------------------------------------------- actions

  const openCreate = (day?: number, time?: string) => {
    if (!resources || !canEdit) return;
    const start = time ?? resources.settings.start;
    setModal({
      classId: view === "class" ? entityId : resources.classes[0]?.id ?? "",
      subjectId: "",
      teacherId: view === "teacher" ? entityId : "",
      roomId: view === "room" ? entityId : "",
      termId,
      dayOfWeek: day ?? currentDay ?? 1,
      startTime: start,
      endTime: fromMinutes(Math.min(toMinutes(start) + 60, 23 * 60 + 59)),
      label: "",
      notes: "",
    });
  };

  /** Drag & drop / resize / keyboard move: optimistic, with an explicit choice on conflict. */
  const moveSession = async (session: Session, change: SlotChange, force = false): Promise<void> => {
    const previous = sessions;
    setSessions((list) => list?.map((s) => (s.id === session.id ? { ...s, ...change } : s)) ?? null);
    try {
      await api.patch<Session>(`/timetable/sessions/${session.id}`, { ...change, ...(force ? { force: true } : {}) });
      feedback.toast({
        kind: force ? "warning" : "success",
        title: force ? "Séance déplacée malgré le conflit" : "Séance déplacée",
        message: `${sessionTitle(session)} · ${DAY_NAMES[change.dayOfWeek]} ${change.startTime}–${change.endTime}`,
        action: force
          ? undefined
          : { label: "Annuler", onClick: () => moveSession({ ...session, ...change }, { dayOfWeek: session.dayOfWeek, startTime: session.startTime, endTime: session.endTime }) },
      });
      refreshAfterChange();
    } catch (err) {
      setSessions(previous);
      if (err instanceof ApiError && err.status === 409) {
        const conflicts = ((err.body as { conflicts?: Conflict[] })?.conflicts ?? []).filter((c) => c.severity === "error");
        const ok = await feedback.confirm({
          title: "Ce créneau est en conflit",
          tone: "warning",
          message: (
            <div className="conflict-list">
              {conflicts.map((c, i) => (
                <div key={i} className="conflict-item error">
                  <AlertTriangle size={16} />
                  <span>{c.message}</span>
                </div>
              ))}
              <p style={{ marginTop: 6 }}>Déplacer quand même ? La séance restera signalée en conflit.</p>
            </div>
          ),
          confirmLabel: "Déplacer quand même",
          cancelLabel: "Ne pas déplacer",
        });
        if (ok) await moveSession(session, change, true);
      } else {
        feedback.error("Déplacement impossible", errorMessage(err));
      }
    }
  };

  const deleteSession = async (id: string) => {
    const session = sessions?.find((s) => s.id === id);
    const ok = await feedback.confirm({
      title: "Supprimer cette séance ?",
      message: session ? `${sessionTitle(session)} — ${session.class.name}, ${DAY_NAMES[session.dayOfWeek]} ${session.startTime}–${session.endTime}` : undefined,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await api.delete(`/timetable/sessions/${id}`);
      setModal(null);
      feedback.success("Séance supprimée");
      refreshAfterChange();
    } catch (err) {
      feedback.error("Suppression impossible", errorMessage(err));
    }
  };

  // ---------------------------------------------------------------- render

  if (error && !resources) {
    return <EmptyState tone="error" title="Emploi du temps indisponible" action={<button className="btn btn-outline" onClick={() => location.reload()}>Réessayer</button>}>{error}</EmptyState>;
  }

  const selected = entities.find((e) => e.id === entityId);
  const noEntities = resources && entities.length === 0;

  return (
    <>
      <PageHeader
        title="Emplois du temps"
        description={
          resources
            ? `${resources.academicYear.name} · ${selected ? `${selected.name} — ` : ""}${sessions ? `${sessions.length} séance(s), ${Math.round(totalMinutes / 6) / 10} h / semaine` : "chargement…"}`
            : "Chargement…"
        }
        actions={
          canEdit && (
            <>
              <Link href="/timetable/manage" className="btn btn-outline">
                <Settings2 size={16} /> Salles, matières & horaires
              </Link>
              <Link href="/timetable/import" className="btn btn-outline">
                <FileUp size={16} /> Importer un fichier
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => openCreate()} disabled={!resources || !resources.classes.length}>
                <Plus size={16} /> Nouvelle séance
              </button>
            </>
          )
        }
      />

      <div className="tt-toolbar" role="toolbar" aria-label="Affichage de l'emploi du temps">
        <div className="segmented" role="group" aria-label="Vue">
          {VIEWS.map(({ mode, label, icon: Icon }) => (
            <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setParams({ view: mode, id: null, highlight: null })}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <select className="input tt-entity" aria-label={`Choisir : ${VIEWS.find((v) => v.mode === view)?.label}`} value={entityId} onChange={(e) => setParams({ id: e.target.value, highlight: null })}>
          {!entityId && <option value="">— Choisir —</option>}
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.hint ? ` — ${e.hint}` : ""}
            </option>
          ))}
        </select>
        {resources && resources.terms.length > 0 && (
          <select className="input" style={{ width: "auto" }} aria-label="Période" value={termId} onChange={(e) => setParams({ term: e.target.value })}>
            <option value="">Toute l&apos;année</option>
            {resources.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <span className="tt-toolbar-spacer" />
        {!narrow && (
          <div className="segmented" role="group" aria-label="Période affichée">
            <button type="button" aria-pressed={!dayMode} onClick={() => setParams({ day: null })}>
              <CalendarRange size={15} /> Semaine
            </button>
            <button type="button" aria-pressed={dayMode} onClick={() => setParams({ day: String(currentDay ?? 1) })}>
              <CalendarDays size={15} /> Jour
            </button>
          </div>
        )}
        <button type="button" className={`btn btn-sm ${blockingCount ? "btn-danger-ghost" : "btn-ghost"}`} onClick={() => setShowConflicts(true)} disabled={allConflicts === null}>
          <AlertTriangle size={15} />
          {blockingCount ? `${blockingCount} conflit${blockingCount > 1 ? "s" : ""}` : "Aucun conflit"}
        </button>
      </div>

      {dayMode && allDays.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Jour" style={{ marginBottom: 12, width: "100%", overflowX: "auto" }}>
          {allDays.map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === currentDay} aria-pressed={d === currentDay} style={{ flex: 1 }} onClick={() => setParams({ day: String(d) })}>
              {narrow ? DAY_NAMES[d].slice(0, 3) : DAY_NAMES[d]}
            </button>
          ))}
        </div>
      )}

      {viewBlocking > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <AlertTriangle size={17} />
          <div className="alert-body">
            <span className="alert-title">{viewBlocking} séance(s) en conflit dans cette vue.</span> Les séances hachurées en rouge partagent un enseignant, une salle ou une classe au même moment. Cliquez dessus pour corriger.
          </div>
        </div>
      )}

      {noEntities ? (
        <div className="card">
          <EmptyState
            icon={view === "room" ? <DoorOpen size={22} /> : <GraduationCap size={22} />}
            title={view === "room" ? "Aucune salle enregistrée" : view === "teacher" ? "Aucun enseignant" : "Aucune classe pour l'année en cours"}
            action={
              canEdit && view === "room" ? (
                <Link href="/timetable/manage?tab=rooms" className="btn btn-primary">
                  <Plus size={16} /> Ajouter des salles
                </Link>
              ) : undefined
            }
          >
            {view === "room" ? "Ajoutez vos salles pour suivre leur occupation." : "Créez-les d'abord dans le module correspondant."}
          </EmptyState>
        </div>
      ) : !resources || !sessions ? (
        <div className="tt-grid" aria-busy="true" style={{ padding: 16 }}>
          <div className="skeleton" style={{ height: 32, marginBottom: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 50 + ((i * 37) % 60) }} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <TimetableGrid
            days={days}
            bounds={bounds}
            settings={resources.settings}
            sessions={sessions}
            view={view}
            editable={canEdit}
            highlightId={highlight}
            onSlotClick={(day, time) => openCreate(day, time)}
            onSessionClick={(s) => setModal(draftFromSession(s))}
            onSessionChange={(s, change) => moveSession(s, change)}
          />
          {sessions.length === 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <EmptyState
                icon={<CalendarDays size={22} />}
                title="Aucune séance pour le moment"
                action={
                  canEdit && (
                    <div className="btn-row" style={{ justifyContent: "center" }}>
                      <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
                        <Plus size={16} /> Ajouter une séance
                      </button>
                      <Link href="/timetable/import" className="btn btn-outline">
                        <FileUp size={16} /> Importer un fichier existant
                      </Link>
                    </div>
                  )
                }
              >
                {canEdit ? "Cliquez dans la grille pour créer une séance, ou importez un emploi du temps (Excel, CSV, PDF, Word, photo)." : "L'emploi du temps n'a pas encore été saisi."}
              </EmptyState>
            </div>
          )}
          <div className="tt-legend" aria-hidden={!canEdit}>
            {canEdit && !narrow && <span>Glissez une séance pour la déplacer, tirez son bord inférieur pour changer sa durée, cliquez dans une case vide pour en créer une. Clavier : Alt + flèches.</span>}
            {canEdit && narrow && <span>Touchez une séance pour la modifier, ou une case vide pour en créer une.</span>}
            <span>
              <i style={{ background: "var(--danger)" }} /> Conflit
            </span>
            <span>
              <i style={{ background: "var(--warning-mark)" }} /> Avertissement (pause, hors horaires)
            </span>
          </div>
        </>
      )}

      {resources && (
        <SessionModal
          open={!!modal}
          initial={modal}
          resources={resources}
          readOnly={!canEdit}
          onClose={() => setModal(null)}
          onSaved={(saved, created) => {
            setModal(null);
            const conflicted = hasBlocking(saved.conflicts);
            feedback.toast({
              kind: conflicted ? "warning" : "success",
              title: created ? "Séance créée" : "Séance enregistrée",
              message: `${sessionTitle(saved)} · ${saved.class.name} · ${DAY_NAMES[saved.dayOfWeek]} ${saved.startTime}–${saved.endTime}${conflicted ? " — en conflit" : ""}`,
            });
            refreshAfterChange();
          }}
          onDeleted={deleteSession}
        />
      )}

      <Modal open={showConflicts} onClose={() => setShowConflicts(false)} size="lg" title="Conflits de l'emploi du temps" description="Toutes classes confondues, pour l'année en cours.">
        {!allConflicts || allConflicts.length === 0 ? (
          <EmptyState icon={<CalendarDays size={22} />} title="Aucun conflit">
            Aucun enseignant, aucune salle et aucune classe n&apos;est réservé deux fois au même moment.
          </EmptyState>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {allConflicts.map((s) => (
              <button
                type="button"
                key={s.id}
                className="card card-interactive"
                style={{ textAlign: "left", padding: 14, cursor: "pointer" }}
                onClick={() => {
                  setShowConflicts(false);
                  setParams({ view: "class", id: s.classId, day: null, highlight: s.id });
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <strong>
                    {sessionTitle(s)} · {s.class.name}
                  </strong>
                  <span className="muted tabular" style={{ fontSize: 12.5 }}>
                    {DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime}
                  </span>
                </div>
                <div className="conflict-list">
                  {s.conflicts.map((c, i) => (
                    <div key={i} className={`conflict-item ${c.severity}`}>
                      <AlertTriangle size={14} />
                      <span>{c.message}</span>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

export default function TimetablePage() {
  return (
    <Shell title="Emplois du temps">
      <Suspense fallback={null}>
        <TimetableEditor />
      </Suspense>
    </Shell>
  );
}
