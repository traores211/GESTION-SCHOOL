"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  CalendarRange,
  DoorOpen,
  FileDown,
  FileUp,
  GraduationCap,
  History,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Undo2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, Modal, PageHeader, useFeedback } from "../../components/ui";
import TimetableGrid, { SlotChange } from "../../components/timetable/TimetableGrid";
import TimetableNav from "../../components/timetable/TimetableNav";
import SessionModal, { SessionDraft, draftFromSession } from "../../components/timetable/SessionModal";
import { api, ApiError, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import { downloadFile } from "../../lib/download";
import {
  Check,
  DAY_NAMES,
  EDITOR_ROLES,
  Resources,
  Session,
  Suggestions,
  ViewMode,
  formatHours,
  fromMinutes,
  gridBounds,
  hasBlocking,
  sessionTitle,
  toMinutes,
  visibleDays,
} from "../../lib/timetable";

interface HistoryBatch {
  batchId: string;
  action: string;
  userName: string | null;
  createdAt: string;
  undone: boolean;
  undoable: boolean;
  count: number;
  summary: string;
}

/** A refused change: what failed, and what would work instead. */
interface Refusal {
  session: Session;
  message: string;
  checks: Check[];
  suggestions: Suggestions | null;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Ajout",
  UPDATE: "Modification",
  DELETE: "Suppression",
  SWAP: "Échange",
  LOCK: "Verrouillage",
  GENERATE: "Génération",
  UNDO: "Annulation",
};

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
  const [swapSource, setSwapSource] = useState<Session | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [history, setHistory] = useState<HistoryBatch[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

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
  // A 45–60 min period counts as one teaching hour (official volumes).
  const slot = resources?.settings.slotMinutes ?? 60;
  const hourUnit = slot >= 45 && slot <= 60 ? slot : 60;

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

  /** A refused change shows what failed and fetches compatible slots, teachers and rooms. */
  const showRefusal = async (session: Session, err: ApiError) => {
    const body = err.body as { checks?: Check[] } | undefined;
    setRefusal({ session, message: err.message, checks: (body?.checks ?? []).filter((c) => c.status === "fail"), suggestions: null });
    try {
      const suggestions = await api.get<Suggestions>(`/timetable/sessions/${session.id}/suggestions`);
      setRefusal((r) => (r && r.session.id === session.id ? { ...r, suggestions } : r));
    } catch {
      setRefusal((r) => (r ? { ...r, suggestions: { slots: [], teachers: [], rooms: [] } } : r));
    }
  };

  /** Drag & drop / resize / keyboard move / suggestion: optimistic; the server applies every rule. */
  const changeSession = async (session: Session, change: Partial<SlotChange> & { teacherId?: string; roomId?: string }, label?: string): Promise<boolean> => {
    const previous = sessions;
    if (change.dayOfWeek) setSessions((list) => list?.map((s) => (s.id === session.id ? { ...s, ...change } : s)) ?? null);
    try {
      await api.patch<Session>(`/timetable/sessions/${session.id}`, change);
      feedback.toast({
        kind: "success",
        title: label ?? "Cours déplacé",
        message: change.dayOfWeek ? `${sessionTitle(session)} · ${DAY_NAMES[change.dayOfWeek]} ${change.startTime}–${change.endTime}` : sessionTitle(session),
        action: change.dayOfWeek
          ? { label: "Annuler", onClick: () => changeSession({ ...session, ...change } as Session, { dayOfWeek: session.dayOfWeek, startTime: session.startTime, endTime: session.endTime }, "Déplacement annulé") }
          : undefined,
      });
      refreshAfterChange();
      return true;
    } catch (err) {
      setSessions(previous);
      if (err instanceof ApiError && err.status === 409) await showRefusal(session, err);
      else feedback.error("Modification impossible", errorMessage(err));
      return false;
    }
  };
  const moveSession = (session: Session, change: SlotChange) => changeSession(session, change);

  const swapWith = async (target: Session) => {
    const source = swapSource;
    setSwapSource(null);
    if (!source || source.id === target.id) return;
    try {
      await api.post(`/timetable/sessions/${source.id}/swap`, { otherId: target.id });
      feedback.success("Cours échangés", `${sessionTitle(source)} ⇄ ${sessionTitle(target)}`);
      refreshAfterChange();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await showRefusal(source, err);
      else feedback.error("Échange impossible", errorMessage(err));
    }
  };

  const toggleLock = async (id: string, locked: boolean) => {
    try {
      await api.patch(`/timetable/sessions/${id}/lock`, { locked });
      feedback.success(locked ? "Cours verrouillé" : "Cours déverrouillé", locked ? "La génération automatique ne le modifiera pas." : undefined);
      load();
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
    }
  };

  const lockClass = async (locked: boolean) => {
    try {
      const r = await api.post<{ count: number }>("/timetable/lock-class", { classId: entityId, locked });
      feedback.success(locked ? "Classe verrouillée" : "Classe déverrouillée", `${r.count} cours`);
      load();
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
    }
  };

  const loadHistory = useCallback(() => {
    api
      .get<HistoryBatch[]>("/timetable/history?limit=40")
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const undo = async (batch: HistoryBatch) => {
    const ok = await feedback.confirm({ title: "Annuler cette modification ?", message: batch.summary, confirmLabel: "Annuler la modification", cancelLabel: "Garder" });
    if (!ok) return;
    try {
      await api.post(`/timetable/history/${batch.batchId}/undo`);
      feedback.success("Modification annulée");
      loadHistory();
      refreshAfterChange();
    } catch (err) {
      feedback.error("Annulation impossible", errorMessage(err));
    }
  };

  const exportFile = async (format: "pdf" | "xlsx", all: boolean) => {
    const key = `${format}-${all ? "all" : "one"}`;
    setExporting(key);
    try {
      const q = new URLSearchParams({ format, view });
      if (!all && entityId) q.set("id", entityId);
      const name = all ? `emplois-du-temps-${view === "class" ? "classes" : view === "teacher" ? "enseignants" : "salles"}` : `emploi-du-temps-${selected?.name ?? view}`;
      await downloadFile(`/timetable/export?${q}`, `${name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.${format}`);
    } catch (err) {
      feedback.error("Export impossible", errorMessage(err));
    } finally {
      setExporting(null);
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
            ? `${resources.academicYear.name} · ${selected ? `${selected.name} — ` : ""}${sessions ? `${sessions.length} cours, ${formatHours(totalMinutes / hourUnit)} de cours / semaine` : "chargement…"}`
            : "Chargement…"
        }
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowExport(true)} disabled={!entityId}>
              <FileDown size={16} /> Exporter
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowHistory(true);
                    loadHistory();
                  }}
                >
                  <History size={16} /> Historique
                </button>
                <button type="button" className="btn btn-primary" onClick={() => openCreate()} disabled={!resources || !resources.classes.length}>
                  <Plus size={16} /> Nouveau cours
                </button>
              </>
            )}
          </>
        }
      />
      <TimetableNav />

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
        {canEdit && view === "class" && sessions && sessions.length > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => lockClass(!sessions.every((s) => s.locked))} title="Les cours verrouillés sont conservés lors des régénérations">
            {sessions.every((s) => s.locked) ? <LockOpen size={15} /> : <Lock size={15} />}
            {sessions.every((s) => s.locked) ? "Déverrouiller la classe" : "Verrouiller la classe"}
          </button>
        )}
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

      {swapSource && (
        <div className="alert alert-info swap-banner" role="status" style={{ marginBottom: 12 }}>
          <ArrowLeftRight size={17} />
          <div className="alert-body">
            <span className="alert-title">Échange :</span> cliquez sur le cours à échanger avec « {sessionTitle(swapSource)} » ({DAY_NAMES[swapSource.dayOfWeek]} {swapSource.startTime}). Les deux cours doivent rester conformes à toutes les règles.
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwapSource(null)}>
            <X size={15} /> Annuler
          </button>
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
            editable={canEdit && !swapSource}
            highlightId={highlight}
            markedId={swapSource?.id}
            onSlotClick={(day, time) => openCreate(day, time)}
            onSessionClick={(s) => (swapSource ? swapWith(s) : setModal(draftFromSession(s)))}
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
            <span>
              <Lock size={12} aria-hidden="true" /> Verrouillé (conservé par la génération)
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
            const warnings = (saved as Session & { warnings?: { message: string }[] }).warnings ?? [];
            feedback.toast({
              kind: warnings.length ? "warning" : "success",
              title: created ? "Cours créé" : "Cours enregistré",
              message: `${sessionTitle(saved)} · ${saved.class.name} · ${DAY_NAMES[saved.dayOfWeek]} ${saved.startTime}–${saved.endTime}${warnings.length ? ` — ${warnings[0].message}` : ""}`,
            });
            refreshAfterChange();
          }}
          onDeleted={deleteSession}
          onLockToggle={canEdit ? toggleLock : undefined}
          onSwapStart={
            canEdit
              ? (id) => {
                  const s = sessions?.find((x) => x.id === id);
                  setModal(null);
                  if (s) setSwapSource(s);
                }
              : undefined
          }
        />
      )}

      <Modal
        open={!!refusal}
        onClose={() => setRefusal(null)}
        size="lg"
        title="Modification refusée"
        description={refusal ? `${sessionTitle(refusal.session)} · ${refusal.session.class.name} · ${DAY_NAMES[refusal.session.dayOfWeek]} ${refusal.session.startTime}–${refusal.session.endTime}` : undefined}
      >
        {refusal && (
          <div className="stack" style={{ gap: 14 }}>
            <ul className="checklist-items">
              {(refusal.checks.length ? refusal.checks : [{ id: "GRID", status: "fail", label: refusal.message } as Check]).map((c, i) => (
                <li key={i} className="is-fail">
                  <XCircle size={16} className="check-fail" />
                  <span>
                    {c.label}
                    {c.detail && <small>{c.detail}</small>}
                  </span>
                </li>
              ))}
            </ul>
            {!refusal.suggestions ? (
              <p className="muted">
                <LoaderCircle size={14} className="spin" /> Recherche des solutions compatibles…
              </p>
            ) : (
              <>
                <div>
                  <h3 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>
                    Créneaux compatibles
                  </h3>
                  {refusal.suggestions.slots.length === 0 ? (
                    <p className="muted">Aucun autre créneau ne respecte toutes les règles pour ce cours.</p>
                  ) : (
                    <div className="btn-row">
                      {refusal.suggestions.slots.map((s) => (
                        <button
                          key={`${s.dayOfWeek}-${s.startTime}`}
                          type="button"
                          className="chip"
                          title={s.warnings ? `${s.warnings} avertissement(s) non bloquant(s)` : "Sans avertissement"}
                          onClick={async () => {
                            const r = refusal;
                            setRefusal(null);
                            await changeSession(r.session, { dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime });
                          }}
                        >
                          {DAY_NAMES[s.dayOfWeek].slice(0, 3)} {s.startTime}
                          {s.warnings ? " ⚠" : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {refusal.suggestions.teachers.length > 0 && (
                  <div>
                    <h3 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Autres professeurs habilités et libres sur ce créneau
                    </h3>
                    <div className="btn-row">
                      {refusal.suggestions.teachers.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="chip"
                          onClick={async () => {
                            const r = refusal;
                            setRefusal(null);
                            await changeSession(r.session, { teacherId: t.id }, `Cours confié à ${t.name}`);
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {refusal.suggestions.rooms.length > 0 && (
                  <div>
                    <h3 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Salles libres et adaptées
                    </h3>
                    <div className="btn-row">
                      {refusal.suggestions.rooms.slice(0, 12).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="chip"
                          onClick={async () => {
                            const current = refusal;
                            setRefusal(null);
                            await changeSession(current.session, { roomId: r.id }, `Salle changée : ${r.name}`);
                          }}
                        >
                          {r.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showHistory} onClose={() => setShowHistory(false)} size="lg" title="Historique des modifications" description="Qui a modifié quoi, et quand. Une modification peut être annulée tant que les cours concernés n'ont pas changé depuis.">
        {!history ? (
          <p className="muted">
            <LoaderCircle size={14} className="spin" /> Chargement…
          </p>
        ) : history.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="Aucune modification">
            Les ajouts, déplacements, échanges, verrouillages et générations apparaîtront ici.
          </EmptyState>
        ) : (
          <ol className="history-list">
            {history.map((h) => (
              <li key={h.batchId} className={h.undone ? "is-undone" : ""}>
                <div className="history-main">
                  <span className={`badge ${h.action === "GENERATE" ? "badge-info" : h.action === "UNDO" ? "badge-neutral" : "badge-success"}`}>{ACTION_LABELS[h.action] ?? h.action}</span>
                  <span className="history-summary">{h.summary}</span>
                </div>
                <div className="history-meta">
                  <span>
                    {h.userName ?? "—"} · {new Date(h.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    {h.undone ? " · annulée" : ""}
                  </span>
                  {h.undoable && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => undo(h)}>
                      <Undo2 size={14} /> Annuler
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Modal>

      <Modal open={showExport} onClose={() => setShowExport(false)} title="Exporter l'emploi du temps" description="PDF imprimable (A4 paysage) ou classeur Excel, une page ou une feuille par emploi du temps.">
        <div className="export-grid">
          {(["pdf", "xlsx"] as const).map((format) =>
            [false, true].map((all) => {
              const key = `${format}-${all ? "all" : "one"}`;
              return (
                <button key={key} type="button" className="export-option" onClick={() => exportFile(format, all)} disabled={!!exporting || (!all && !entityId)}>
                  {exporting === key ? <LoaderCircle size={18} className="spin" /> : <FileDown size={18} />}
                  <span>
                    <strong>{format === "pdf" ? "PDF" : "Excel"}</strong>
                    <small>{all ? `Tou${view === "room" ? "tes les salles" : view === "teacher" ? "s les enseignants" : "tes les classes"}` : selected?.name ?? "—"}</small>
                  </span>
                </button>
              );
            }),
          )}
        </div>
      </Modal>

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
