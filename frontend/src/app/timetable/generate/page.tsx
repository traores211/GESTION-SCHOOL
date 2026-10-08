"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Info, LoaderCircle, Lock, RefreshCw, Sparkles, Wand2, XCircle } from "lucide-react";
import Shell from "../../../components/Shell";
import { EmptyState, FormError, PageHeader, useFeedback } from "../../../components/ui";
import TimetableGrid, { GridSession } from "../../../components/timetable/TimetableGrid";
import TimetableNav from "../../../components/timetable/TimetableNav";
import { api, errorMessage } from "../../../lib/api";
import { Resources, Session, formatHours, gridBounds, visibleDays } from "../../../lib/timetable";
import "../../../components/timetable/timetable.css";

type Scope = "all" | "level" | "class";

interface ProposedLesson {
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  className?: string;
  subjectName?: string;
  teacherName?: string;
  roomName?: string | null;
}

interface Proposal {
  lessons: ProposedLesson[];
  unplaced: { classId: string; subjectId: string; className: string; subjectName: string; missingHours: number; reason: string; message: string }[];
  score: { total: number; spread: number; gapHours: number; afternoon: number };
  stats: { classes: number; requiredHours: number; placedHours: number; lockedHours: number; complete: boolean; mode: "exact" | "best-effort"; nodes: number; ms: number };
  notes: string[];
  replaced: number;
  locked: number;
  scope: { scope: Scope; level?: string; classId?: string };
}

function GenerateContent() {
  const feedback = useFeedback();
  const [resources, setResources] = useState<Resources | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [level, setLevel] = useState("");
  const [classId, setClassId] = useState("");
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [previewClass, setPreviewClass] = useState("");
  const [lockedLessons, setLockedLessons] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Resources>("/timetable/resources")
      .then((r) => {
        setResources(r);
        setLevel(r.classes[0]?.level ?? "");
        setClassId(r.classes[0]?.id ?? "");
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const levels = useMemo(() => [...new Set(resources?.classes.map((c) => c.level) ?? [])], [resources]);
  const volumeCount = resources?.planning?.volumes.length ?? 0;
  const qualificationCount = resources?.planning?.qualifications.length ?? 0;

  const body = () => ({ scope, ...(scope === "level" ? { level } : {}), ...(scope === "class" ? { classId } : {}) });

  const run = async () => {
    setRunning(true);
    setError(null);
    setProposal(null);
    try {
      const p = await api.post<Proposal>("/timetable/generate/preview", body());
      setProposal(p);
      const first = p.lessons[0]?.classId ?? (scope === "class" ? classId : resources?.classes.find((c) => scope === "all" || c.level === level)?.id) ?? "";
      setPreviewClass(first);
      const r = await api.get<{ sessions: Session[] }>("/timetable/sessions");
      setLockedLessons(r.sessions.filter((s) => s.locked));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    const ok = await feedback.confirm({
      title: "Appliquer cette proposition ?",
      message: `${proposal.lessons.length} cours seront créés et ${proposal.replaced} cours non verrouillés seront remplacés. Les ${proposal.locked} cours verrouillés sont conservés. Vous pourrez annuler depuis l'historique.`,
      confirmLabel: "Appliquer",
      cancelLabel: "Revenir",
    });
    if (!ok) return;
    setApplying(true);
    try {
      const r = await api.post<{ created: number; replaced: number }>("/timetable/generate/apply", {
        ...body(),
        lessons: proposal.lessons.map(({ classId, subjectId, teacherId, roomId, dayOfWeek, startTime, endTime }) => ({ classId, subjectId, teacherId, roomId, dayOfWeek, startTime, endTime })),
      });
      feedback.success("Emploi du temps enregistré", `${r.created} cours créés, ${r.replaced} remplacés`);
      setProposal(null);
    } catch (err) {
      feedback.error("Application impossible", errorMessage(err));
    } finally {
      setApplying(false);
    }
  };

  const scopeClasses = useMemo(() => {
    if (!resources || !proposal) return [];
    const ids = new Set([...proposal.lessons.map((l) => l.classId), ...proposal.unplaced.map((u) => u.classId)]);
    return resources.classes.filter((c) => ids.has(c.id));
  }, [resources, proposal]);

  const gridSessions: GridSession[] = useMemo(() => {
    if (!proposal || !resources) return [];
    const subjects = new Map(resources.subjects.map((s) => [s.id, s]));
    const proposed = proposal.lessons
      .filter((l) => l.classId === previewClass)
      .map((l, i) => ({
        id: `p${i}`,
        dayOfWeek: l.dayOfWeek,
        startTime: l.startTime,
        endTime: l.endTime,
        subject: { name: l.subjectName ?? "?", color: subjects.get(l.subjectId)?.color ?? null },
        class: { name: l.className ?? "" },
        teacher: l.teacherName ? { name: l.teacherName } : null,
        room: l.roomName ? { name: l.roomName } : null,
      }));
    const locked = lockedLessons
      .filter((s) => s.classId === previewClass)
      .map((s) => ({ ...s, locked: true, subject: s.subject ? { name: s.subject.name, color: s.subject.color } : null }));
    return [...proposed, ...locked];
  }, [proposal, resources, previewClass, lockedLessons]);

  if (!resources) {
    return error ? <EmptyState tone="error" title="Génération indisponible">{error}</EmptyState> : <div className="skeleton" style={{ height: 200 }} />;
  }

  const placedPct = proposal && proposal.stats.requiredHours - proposal.stats.lockedHours > 0 ? proposal.stats.placedHours / (proposal.stats.requiredHours - proposal.stats.lockedHours) : 1;

  return (
    <>
      <PageHeader title="Génération automatique" description={`${resources.academicYear.name} · emplois du temps par classe, dans le respect des volumes officiels, des habilitations et des disponibilités`} />
      <TimetableNav />

      {(volumeCount === 0 || qualificationCount === 0) && (
        <div className="alert alert-warning" style={{ marginBottom: 14 }}>
          <CircleAlert size={17} />
          <div className="alert-body">
            <span className="alert-title">Données de planification incomplètes.</span> {volumeCount === 0 ? "Aucun volume horaire officiel n'est défini. " : ""}
            {qualificationCount === 0 ? "Aucune habilitation de professeur n'est enregistrée. " : ""}
            <Link href="/timetable/planning">Importez le fichier Professeurs & volumes</Link> avant de générer.
          </div>
        </div>
      )}

      <section className="card" aria-labelledby="gen-scope-title">
        <h2 id="gen-scope-title" className="card-title">
          Périmètre
        </h2>
        <div className="gen-scope">
          <div className="segmented" role="group" aria-label="Périmètre de génération">
            {(
              [
                ["all", "Toutes les classes"],
                ["level", "Un niveau"],
                ["class", "Une classe"],
              ] as [Scope, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}>
                {label}
              </button>
            ))}
          </div>
          {scope === "level" && (
            <select className="input" style={{ width: "auto" }} aria-label="Niveau" value={level} onChange={(e) => setLevel(e.target.value)}>
              {levels.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}
          {scope === "class" && (
            <select className="input" style={{ width: "auto" }} aria-label="Classe" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {resources.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-primary" onClick={run} disabled={running || applying}>
            {running ? <LoaderCircle size={16} className="spin" /> : <Wand2 size={16} />} {running ? "Calcul en cours…" : proposal ? "Relancer" : "Générer une proposition"}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          <Lock size={13} style={{ verticalAlign: "-2px" }} /> Les cours <strong>verrouillés</strong> sont conservés et comptent dans les volumes. Les autres cours du périmètre sont remplacés, et seulement après votre confirmation.
        </p>
        <details className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          <summary style={{ cursor: "pointer" }}>Comment la génération fonctionne</summary>
          <p style={{ marginTop: 6 }}>
            Chaque volume officiel est découpé en séances (durée maximale respectée) confiées à un professeur habilité qui a encore des heures disponibles. Une recherche par contraintes
            place d&apos;abord les cours les plus difficiles (le moins de créneaux possibles) et revient en arrière en cas d&apos;impasse. Les règles dures ne sont jamais enfreintes :
            disponibilités, habilitations, une seule séance par professeur, classe et salle, volumes exacts, volume maximum des professeurs, pauses et demi-journées libres. Les
            préférences (répartir une matière sur la semaine, éviter les trous, matières à fort coefficient le matin) sont ensuite optimisées. Ce qui ne peut pas être placé est
            listé avec sa cause.
          </p>
        </details>
      </section>

      <FormError message={error} />

      {running && (
        <div className="card" style={{ marginTop: 16 }} aria-busy="true">
          <p className="muted">
            <LoaderCircle size={15} className="spin" /> Recherche d&apos;un emploi du temps respectant toutes les contraintes… quelques secondes pour toute l&apos;école.
          </p>
        </div>
      )}

      {proposal && (
        <section style={{ marginTop: 16 }} aria-labelledby="gen-result-title" className="page-enter">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 id="gen-result-title" className="card-title" style={{ margin: 0 }}>
              Proposition
            </h2>
            <div className="btn-row">
              <button type="button" className="btn btn-outline" onClick={run} disabled={running || applying}>
                <RefreshCw size={16} /> Relancer
              </button>
              <button type="button" className="btn btn-primary" onClick={apply} disabled={applying || proposal.lessons.length === 0}>
                {applying ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Appliquer ({proposal.lessons.length} cours)
              </button>
            </div>
          </div>

          <div className="gen-stats">
            <div className={`gen-stat ${proposal.stats.complete ? "is-good" : "is-bad"}`}>
              <strong>
                {formatHours(proposal.stats.placedHours + proposal.stats.lockedHours)} / {formatHours(proposal.stats.requiredHours)}
              </strong>
              <span>heures officielles couvertes ({Math.round(placedPct * 100)} % des heures à placer)</span>
            </div>
            <div className="gen-stat">
              <strong>{proposal.lessons.length}</strong>
              <span>
                cours proposés pour {proposal.stats.classes} classe{proposal.stats.classes > 1 ? "s" : ""}
              </span>
            </div>
            <div className="gen-stat">
              <strong>{proposal.locked}</strong>
              <span>cours verrouillés conservés · {proposal.replaced} remplacés</span>
            </div>
            <div className="gen-stat">
              <strong>{proposal.score.total}</strong>
              <span>
                score (plus bas = mieux) · {proposal.score.spread} doublon(s) jour, {formatHours(proposal.score.gapHours)} de trous, {proposal.score.afternoon} coef. fort l&apos;après-midi
              </span>
            </div>
            <div className="gen-stat">
              <strong>{(proposal.stats.ms / 1000).toFixed(1)} s</strong>
              <span>{proposal.stats.mode === "exact" ? "solution exacte trouvée" : "meilleur effort (contraintes trop serrées)"}</span>
            </div>
          </div>

          {proposal.unplaced.length === 0 ? (
            <div className="conflict-ok" style={{ marginBottom: 14 }}>
              <CheckCircle2 size={16} /> Toutes les heures officielles sont placées, sans aucune règle enfreinte.
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 className="card-title" style={{ fontSize: 15 }}>
                Heures non placées ({proposal.unplaced.reduce((s, u) => s + u.missingHours, 0)} h)
              </h3>
              <ul className="unplaced-list">
                {proposal.unplaced.map((u) => (
                  <li key={`${u.classId}-${u.subjectId}`}>
                    <XCircle size={16} />
                    <span>{u.message}</span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                Le reste est placé. Ajustez les disponibilités, les habilitations ou le volume maximum des professeurs, puis relancez — ou appliquez et complétez à la main.
              </p>
            </div>
          )}
          {proposal.notes.length > 0 && (
            <div className="alert alert-info" style={{ marginBottom: 14 }}>
              <Info size={17} />
              <div className="alert-body">{proposal.notes.join(" · ")}</div>
            </div>
          )}

          {scopeClasses.length > 0 && (
            <>
              <div className="tt-toolbar" role="toolbar" aria-label="Aperçu par classe">
                <label htmlFor="gen-preview" className="muted" style={{ fontSize: 13 }}>
                  Aperçu
                </label>
                <select id="gen-preview" className="input tt-entity" value={previewClass} onChange={(e) => setPreviewClass(e.target.value)}>
                  {scopeClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {gridSessions.length} cours · <Lock size={12} style={{ verticalAlign: "-2px" }} /> = verrouillé (conservé)
                </span>
              </div>
              <TimetableGrid days={visibleDays(resources.settings, gridSessions)} bounds={gridBounds(resources.settings, gridSessions)} settings={resources.settings} sessions={gridSessions} view="class" />
            </>
          )}
        </section>
      )}
    </>
  );
}

export default function GeneratePage() {
  return (
    <Shell title="Emplois du temps · Génération">
      <GenerateContent />
    </Shell>
  );
}
