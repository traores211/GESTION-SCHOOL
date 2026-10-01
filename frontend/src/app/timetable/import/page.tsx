"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  OctagonAlert,
  RotateCcw,
  Sparkles,
  Undo2,
  UploadCloud,
  Wand2,
} from "lucide-react";
import Shell from "../../../components/Shell";
import { EmptyState, FormError, PageHeader, Pagination, useFeedback } from "../../../components/ui";
import TimetableGrid, { GridSession } from "../../../components/timetable/TimetableGrid";
import { api, ApiError, errorMessage } from "../../../lib/api";
import { useTable } from "../../../lib/useTable";
import { Conflict, DAY_NAMES, Resources, gridBounds, hasBlocking, visibleDays } from "../../../lib/timetable";
import "../../../components/timetable/timetable.css";

// ------------------------------------------------------------------ API types

type Kind = "class" | "subject" | "teacher" | "room";
type Action = "match" | "create" | "ignore";

interface DraftRow {
  id: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
  roomName: string | null;
  hoursPerWeek: number | null;
  source: string;
  raw: string;
  method: string;
  issues: string[];
}

interface EntityResolution {
  kind: Kind;
  raw: string;
  occurrences: number;
  status: "exact" | "probable" | "ambiguous" | "unknown";
  suggestedAction: Action;
  suggestedId: string | null;
  candidates: { id: string; name: string; score: number }[];
}

interface Analysis {
  file: { name: string; size: number; kind: string; label: string };
  method: string | null;
  aiAvailable: boolean;
  aiUsed: boolean;
  warnings: string[];
  rows: DraftRow[];
  entities: EntityResolution[];
  stats: { rows: number; withIssues: number; requirements: number };
}

interface Capabilities {
  aiAvailable: boolean;
  maxBytes: number;
  formats: { kind: string; label: string; extensions: string[] }[];
}

interface PreviewSession {
  key: string;
  rowId: string | null;
  generated: boolean;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  className: string;
  subject: string | null;
  teacher: string | null;
  room: string | null;
  conflicts: Conflict[];
}

interface Preview {
  sessions: PreviewSession[];
  unplaced: { rowId: string; minutes: number; reason: string; labels: { className: string; subject: string | null } }[];
  rowErrors: { rowId: string; message: string }[];
  toCreate: { class: string[]; subject: string[]; room: string[] };
  replaceCount: number;
  blockingConflicts: number;
  warnings: number;
  generatedCount: number;
}

interface CommitResult {
  importId: string;
  created: number;
  conflictCount: number;
  classIds: string[];
  replaced: number;
  skippedRows: number;
  unplaced: number;
}

interface EditRow extends DraftRow {
  include: boolean;
}

interface Decision {
  action: Action;
  id: string | null;
  confirmed: boolean;
}

type Step = "file" | "analyzing" | "review" | "preview" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "file", label: "Fichier" },
  { id: "analyzing", label: "Analyse" },
  { id: "review", label: "Vérification" },
  { id: "preview", label: "Validation" },
  { id: "done", label: "Emploi du temps" },
];

const KIND_LABELS: Record<Kind, { title: string; one: string }> = {
  class: { title: "Classes", one: "classe" },
  subject: { title: "Matières", one: "matière" },
  teacher: { title: "Enseignants", one: "enseignant" },
  room: { title: "Salles", one: "salle" },
};

const STATUS_BADGE: Record<EntityResolution["status"], { label: string; cls: string }> = {
  exact: { label: "Reconnu", cls: "badge-green" },
  probable: { label: "À confirmer", cls: "badge-warning" },
  ambiguous: { label: "Ambigu", cls: "badge-danger" },
  unknown: { label: "Nouveau", cls: "badge-info" },
};

const METHOD_LABELS: Record<string, string> = {
  list: "Tableau (une ligne par séance)",
  grid: "Grille jours × horaires",
  text: "Texte libre, ligne par ligne",
  ai: "Analyse par IA",
};

const keyOf = (kind: Kind, raw: string) => `${kind}:${raw.trim()}`;

function initialDecision(e: EntityResolution): Decision {
  return { action: e.suggestedAction, id: e.suggestedId, confirmed: e.status === "exact" || e.status === "unknown" };
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

// ------------------------------------------------------------------ page

export default function TimetableImportPage() {
  const router = useRouter();
  const feedback = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("file");
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [resources, setResources] = useState<Resources | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [entities, setEntities] = useState<EntityResolution[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [termId, setTermId] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewClass, setPreviewClass] = useState("");
  const [acceptConflicts, setAcceptConflicts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);

  useEffect(() => {
    api.get<Capabilities>("/timetable/import/capabilities").then(setCaps).catch(() => {});
    api.get<Resources>("/timetable/resources").then(setResources).catch(() => {});
  }, []);

  // ---------------------------------------------------------------- step 1 → 2: upload and analyse

  const analyze = async (selected: File, withAi = useAi) => {
    setError(null);
    if (caps && selected.size > caps.maxBytes) {
      setError(`Fichier trop volumineux (${formatBytes(selected.size)}) : ${formatBytes(caps.maxBytes)} maximum.`);
      return;
    }
    setFile(selected);
    setStep("analyzing");
    try {
      const result = await api.upload<Analysis>(`/timetable/import/analyze${withAi ? "?ai=true" : ""}`, selected);
      setAnalysis(result);
      setRows(result.rows.map((r) => ({ ...r, include: true })));
      setEntities(result.entities);
      setDecisions(Object.fromEntries(result.entities.map((e) => [keyOf(e.kind, e.raw), initialDecision(e)])));
      setPreview(null);
      setStep("review");
    } catch (err) {
      setError(errorMessage(err));
      setStep("file");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) analyze(dropped);
  };

  // ---------------------------------------------------------------- step 3: review & corrections

  const updateRow = (id: string, patch: Partial<EditRow>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Names edited by the user are matched again (debounced); decisions already taken are kept.
  const nameSignature = useMemo(
    () => rows.filter((r) => r.include).map((r) => [r.className, r.subjectName, r.teacherName, r.roomName].join("|")).join("\n"),
    [rows],
  );
  const firstSignature = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "review") return;
    if (firstSignature.current === null) {
      firstSignature.current = nameSignature;
      return;
    }
    if (firstSignature.current === nameSignature) return;
    const t = setTimeout(() => {
      api
        .post<{ entities: EntityResolution[] }>("/timetable/import/resolve", { rows: rows.filter((r) => r.include).map(toPayloadRow) })
        .then(({ entities: fresh }) => {
          firstSignature.current = nameSignature;
          setEntities(fresh);
          setDecisions((prev) => {
            const next: Record<string, Decision> = {};
            for (const e of fresh) next[keyOf(e.kind, e.raw)] = prev[keyOf(e.kind, e.raw)] ?? initialDecision(e);
            return next;
          });
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [nameSignature, rows, step]);

  const unconfirmed = entities.filter((e) => {
    const d = decisions[keyOf(e.kind, e.raw)];
    return !d || !d.confirmed || (d.action === "match" && !d.id);
  });

  const optionsFor = (kind: Kind) => {
    if (!resources) return [];
    if (kind === "class") return resources.classes;
    if (kind === "subject") return resources.subjects;
    if (kind === "teacher") return resources.teachers;
    return resources.rooms;
  };

  const setDecision = (e: EntityResolution, value: string) => {
    const decision: Decision = value === "__create" ? { action: "create", id: null, confirmed: true } : value === "__ignore" ? { action: "ignore", id: null, confirmed: true } : { action: "match", id: value, confirmed: true };
    setDecisions((d) => ({ ...d, [keyOf(e.kind, e.raw)]: decision }));
  };

  const confirmAllProbable = () =>
    setDecisions((d) => {
      const next = { ...d };
      for (const e of entities) if (e.status === "probable" && next[keyOf(e.kind, e.raw)]?.id) next[keyOf(e.kind, e.raw)] = { ...next[keyOf(e.kind, e.raw)], confirmed: true };
      return next;
    });

  function toPayloadRow(r: EditRow) {
    return {
      id: r.id,
      dayOfWeek: r.dayOfWeek || null,
      startTime: r.startTime || null,
      endTime: r.endTime || null,
      className: r.className?.trim() || null,
      subjectName: r.subjectName?.trim() || null,
      teacherName: r.teacherName?.trim() || null,
      roomName: r.roomName?.trim() || null,
      hoursPerWeek: r.hoursPerWeek || null,
    };
  }

  const commitBody = (allowConflicts = false) => ({
    fileName: analysis!.file.name,
    fileType: analysis!.file.kind,
    method: analysis!.method ?? "list",
    mode,
    termId: termId || null,
    allowConflicts,
    rows: rows.filter((r) => r.include).map(toPayloadRow),
    entities: entities.map((e) => {
      const d = decisions[keyOf(e.kind, e.raw)];
      return { kind: e.kind, raw: e.raw, action: d?.action ?? "ignore", id: d?.id ?? null };
    }),
  });

  // ---------------------------------------------------------------- step 4: validation, generation, conflicts

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.post<Preview>("/timetable/import/preview", commitBody());
      setPreview(p);
      setAcceptConflicts(false);
      setPreviewClass(p.sessions[0]?.className ?? "");
      setStep("preview");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<CommitResult>("/timetable/import/commit", commitBody(acceptConflicts));
      setResult(r);
      setStep("done");
      feedback.success("Emploi du temps importé", `${r.created} séance(s) créée(s)`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const p = (err.body as { preview?: Preview })?.preview;
        if (p) setPreview(p);
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!result) return;
    const ok = await feedback.confirm({ title: "Annuler cet import ?", message: `Les ${result.created} séances créées seront supprimées.`, confirmLabel: "Annuler l'import" });
    if (!ok) return;
    try {
      await api.delete(`/timetable/imports/${result.importId}`);
      feedback.success("Import annulé");
      reset();
    } catch (err) {
      feedback.error("Annulation impossible", errorMessage(err));
    }
  };

  const reset = () => {
    setStep("file");
    setFile(null);
    setAnalysis(null);
    setRows([]);
    setEntities([]);
    setDecisions({});
    setPreview(null);
    setResult(null);
    setError(null);
    firstSignature.current = null;
  };

  // ---------------------------------------------------------------- table of rows

  const visibleRows = useMemo(() => (onlyIssues ? rows.filter((r) => r.issues.length || !r.include) : rows), [rows, onlyIssues]);
  const table = useTable<EditRow, "day" | "class">({
    rows: visibleRows,
    accessors: { day: (r) => (r.dayOfWeek ?? 9) * 10000 + Number((r.startTime ?? "99:99").replace(":", "")), class: (r) => r.className },
    searchText: (r) => [r.className, r.subjectName, r.teacherName, r.roomName, r.raw].join(" "),
    pageSize: 25,
  });

  const previewErrorsByRow = useMemo(() => new Map(preview?.rowErrors.map((e) => [e.rowId, e.message]) ?? []), [preview]);

  // ---------------------------------------------------------------- render

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <Shell title="Importer un emploi du temps">
      <PageHeader
        title="Importer un emploi du temps"
        description="Déposez le fichier que vous utilisez déjà : rien n'est enregistré avant votre validation finale."
        breadcrumbs={[{ label: "Emplois du temps", href: "/timetable" }, { label: "Import" }]}
      />

      <ol className="stepper" aria-label="Étapes de l'import">
        {STEPS.map((s, i) => (
          <li key={s.id} style={{ display: "contents" }}>
            {i > 0 && <span className="step-sep" aria-hidden="true" />}
            <span className={`step${i < stepIndex ? " is-done" : ""}${i === stepIndex ? " is-current" : ""}`} aria-current={i === stepIndex ? "step" : undefined}>
              <span className="step-dot">{i < stepIndex ? <Check size={14} /> : i + 1}</span>
              <span className="step-label">{s.label}</span>
            </span>
          </li>
        ))}
      </ol>

      <FormError message={error} />

      {/* ---------------- 1. file ---------------- */}
      {step === "file" && (
        <div className="grid-main-side">
          <div>
            <div
              className={`dropzone${dragging ? " is-dragging" : ""}`}
              role="button"
              tabIndex={0}
              aria-label="Déposer un fichier ou cliquer pour le choisir"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="dropzone-icon">
                <UploadCloud size={28} />
              </span>
              <span className="dropzone-title">{dragging ? "Relâchez pour importer" : "Glissez votre fichier ici"}</span>
              <span>ou cliquez pour le choisir — {caps ? formatBytes(caps.maxBytes) : "10 Mo"} maximum</span>
              <span className="format-chips">
                {(caps?.formats ?? []).map((f) => (
                  <span key={f.kind} className="format-chip">
                    {f.label}
                  </span>
                ))}
              </span>
              <input
                ref={inputRef}
                type="file"
                className="visually-hidden"
                tabIndex={-1}
                aria-label="Fichier d'emploi du temps"
                onClick={(e) => e.stopPropagation()}
                accept=".xlsx,.csv,.tsv,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) analyze(f);
                }}
              />
            </div>
            {caps?.aiAvailable && (
              <label className="checkbox" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                <Sparkles size={15} /> Analyser avec l&apos;IA (documents complexes, photos, PDF scannés) — chaque ligne restera à vérifier
              </label>
            )}
          </div>
          <div className="card">
            <h2 className="card-title">Ce que le fichier peut contenir</h2>
            <ul style={{ margin: "12px 0 0 18px", display: "grid", gap: 8, fontSize: 13.5, color: "var(--text-secondary)" }}>
              <li>
                <strong>Une grille</strong> : jours en colonnes, horaires en lignes, une feuille (ou un titre) par classe.
              </li>
              <li>
                <strong>Une liste</strong> : colonnes Jour, Horaire (ou Début / Fin), Classe, Matière, Enseignant, Salle.
              </li>
              <li>
                <strong>Des volumes horaires</strong> : Classe, Matière, Enseignant, Volume (ex. 4 h) — les séances seront placées automatiquement sans conflit.
              </li>
            </ul>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              Les noms sont rapprochés de vos classes, matières, enseignants et salles. Tout ce qui est incertain vous est demandé : rien n&apos;est inventé.
            </p>
          </div>
        </div>
      )}

      {/* ---------------- 2. analysing ---------------- */}
      {step === "analyzing" && (
        <div className="card" style={{ maxWidth: 640 }} aria-live="polite" aria-busy="true">
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
            <span className="dropzone-icon" style={{ width: 46, height: 46 }}>
              <FileSpreadsheet size={22} />
            </span>
            <div>
              <div className="card-title">{file?.name}</div>
              <div className="card-sub">{file ? formatBytes(file.size) : ""}</div>
            </div>
          </div>
          <div className="progress indeterminate">
            <span />
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Détection du format, extraction du contenu, reconnaissance des jours, horaires, classes, matières, enseignants et salles…
            {file && /\.(png|jpe?g|webp)$/i.test(file.name) && " La lecture d'une image (OCR) peut prendre jusqu'à une minute."}
          </p>
        </div>
      )}

      {/* ---------------- 3. review ---------------- */}
      {step === "review" && analysis && (
        <div className="stack">
          <div className="card">
            <div className="card-head" style={{ marginBottom: 10 }}>
              <div>
                <h2 className="card-title">
                  <FileSpreadsheet size={18} /> {analysis.file.name}
                </h2>
                <p className="card-sub">
                  {analysis.file.label} · {formatBytes(analysis.file.size)} · {analysis.method ? METHOD_LABELS[analysis.method] ?? analysis.method : "aucune structure reconnue"}
                </p>
              </div>
              <div className="btn-row">
                {analysis.aiAvailable && !analysis.aiUsed && file && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => analyze(file, true)}>
                    <Sparkles size={15} /> Relancer avec l&apos;IA
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  <RotateCcw size={15} /> Autre fichier
                </button>
              </div>
            </div>
            <div className="btn-row">
              <span className="badge badge-green">{analysis.stats.rows} ligne(s) lue(s)</span>
              {analysis.stats.withIssues > 0 && <span className="badge badge-warning">{analysis.stats.withIssues} à vérifier</span>}
              {analysis.stats.requirements > 0 && <span className="badge badge-info">{analysis.stats.requirements} volume(s) horaire(s) à placer</span>}
              {analysis.aiUsed && <span className="badge badge-orange">Interprété par l&apos;IA</span>}
            </div>
            {analysis.warnings.map((w, i) => (
              <div key={i} className="alert alert-warning" style={{ marginTop: 10 }}>
                <AlertTriangle size={16} />
                <div className="alert-body">{w}</div>
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="card">
              <EmptyState icon={<FileSpreadsheet size={22} />} title="Aucune séance reconnue" action={<button className="btn btn-primary" onClick={reset}>Essayer un autre fichier</button>}>
                Vérifiez que le fichier contient des jours et des horaires, ou utilisez l&apos;analyse IA si elle est disponible.
              </EmptyState>
            </div>
          ) : (
            <>
              {/* Entity mapping */}
              <section className="card" aria-labelledby="mapping-title">
                <div className="card-head">
                  <div>
                    <h2 id="mapping-title" className="card-title">
                      Correspondances
                    </h2>
                    <p className="card-sub">Chaque nom lu dans le fichier est associé à un élément existant, créé, ou ignoré. Les rapprochements incertains doivent être confirmés.</p>
                  </div>
                  {entities.some((e) => e.status === "probable" && !decisions[keyOf(e.kind, e.raw)]?.confirmed) && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={confirmAllProbable}>
                      <Check size={15} /> Confirmer les suggestions
                    </button>
                  )}
                </div>
                <div className="grid-2">
                  {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => {
                    const list = entities.filter((e) => e.kind === kind);
                    if (!list.length) return null;
                    return (
                      <div key={kind}>
                        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
                          {KIND_LABELS[kind].title} ({list.length})
                        </h3>
                        <div className="stack" style={{ gap: 6 }}>
                          {list.map((e) => {
                            const d = decisions[keyOf(e.kind, e.raw)];
                            const needsChoice = !d?.confirmed || (d.action === "match" && !d.id);
                            const value = d?.action === "create" ? "__create" : d?.action === "ignore" ? "__ignore" : d?.id ?? "";
                            return (
                              <div key={e.raw} className="list-row" style={{ gap: 10, padding: "6px 0", alignItems: "center", background: needsChoice ? "var(--warning-light)" : undefined, borderRadius: 8, paddingInline: needsChoice ? 8 : 0 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div className="cell-main" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={e.raw}>
                                    « {e.raw} »
                                  </div>
                                  <div className="cell-sub">
                                    <span className={`badge ${STATUS_BADGE[e.status].cls}`} style={{ padding: "0 7px", marginRight: 6 }}>
                                      {STATUS_BADGE[e.status].label}
                                    </span>
                                    {e.occurrences} fois
                                  </div>
                                </div>
                                <select
                                  className="input input-sm"
                                  style={{ width: 210 }}
                                  aria-label={`Correspondance pour ${e.raw}`}
                                  value={value}
                                  onChange={(ev) => setDecision(e, ev.target.value)}
                                >
                                  {!value && <option value="">— Choisir —</option>}
                                  {e.candidates.length > 0 && (
                                    <optgroup label="Suggestions">
                                      {e.candidates.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name} ({Math.round(c.score * 100)} %)
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label={`Toutes les ${KIND_LABELS[kind].title.toLowerCase()}`}>
                                    {optionsFor(kind)
                                      .filter((o) => !e.candidates.some((c) => c.id === o.id))
                                      .map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.name}
                                        </option>
                                      ))}
                                  </optgroup>
                                  {kind !== "teacher" && <option value="__create">+ Créer « {e.raw} »</option>}
                                  <option value="__ignore">{kind === "class" ? "Ignorer (lignes exclues)" : "Ignorer"}</option>
                                </select>
                                {needsChoice && d?.id && (
                                  <button type="button" className="btn btn-outline btn-icon btn-sm" aria-label={`Confirmer ${e.raw}`} title="Confirmer" onClick={() => setDecision(e, d.id!)}>
                                    <Check size={15} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Rows */}
              <section className="card" style={{ padding: 0 }} aria-labelledby="rows-title">
                <div style={{ padding: "16px 20px 12px" }}>
                  <h2 id="rows-title" className="card-title">
                    Séances lues ({rows.filter((r) => r.include).length}/{rows.length} retenues)
                  </h2>
                  <p className="card-sub">Corrigez directement les cellules. Décochez une ligne pour l&apos;exclure.</p>
                  <div className="table-toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
                    <div className="table-toolbar-left">
                      <input className="input input-sm" style={{ maxWidth: 260 }} type="search" placeholder="Filtrer les lignes…" aria-label="Filtrer les lignes" value={table.query} onChange={(e) => table.setQuery(e.target.value)} />
                      <label className="checkbox">
                        <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Seulement les lignes à vérifier
                      </label>
                    </div>
                  </div>
                </div>
                <div style={{ overflowX: "auto", borderTop: "1px solid var(--border)" }}>
                  <table className="table-compact">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <span className="visually-hidden">Retenir</span>
                        </th>
                        <th>Jour</th>
                        <th>Début</th>
                        <th>Fin</th>
                        <th>Classe</th>
                        <th>Matière</th>
                        <th>Enseignant</th>
                        <th>Salle</th>
                        <th>Vol. h/sem</th>
                        <th>Origine / à vérifier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.pageRows.map((r) => (
                        <tr key={r.id} style={{ opacity: r.include ? 1 : 0.5, background: r.issues.length && r.include ? "var(--warning-light)" : undefined }}>
                          <td>
                            <input type="checkbox" aria-label={`Retenir la ligne ${r.source}`} checked={r.include} onChange={(e) => updateRow(r.id, { include: e.target.checked })} />
                          </td>
                          <td>
                            <select className="input input-sm" style={{ width: 110 }} aria-label="Jour" value={r.dayOfWeek ?? ""} onChange={(e) => updateRow(r.id, { dayOfWeek: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">—</option>
                              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                <option key={d} value={d}>
                                  {DAY_NAMES[d]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input type="time" className="input input-sm" style={{ width: 104 }} aria-label="Début" value={r.startTime ?? ""} onChange={(e) => updateRow(r.id, { startTime: e.target.value || null })} />
                          </td>
                          <td>
                            <input type="time" className="input input-sm" style={{ width: 104 }} aria-label="Fin" value={r.endTime ?? ""} onChange={(e) => updateRow(r.id, { endTime: e.target.value || null })} />
                          </td>
                          {(["className", "subjectName", "teacherName", "roomName"] as const).map((field) => (
                            <td key={field}>
                              <input className="input input-sm" style={{ minWidth: 110 }} aria-label={field} value={r[field] ?? ""} onChange={(e) => updateRow(r.id, { [field]: e.target.value || null })} />
                            </td>
                          ))}
                          <td>
                            <input type="number" min={0.5} max={40} step={0.5} className="input input-sm" style={{ width: 70 }} aria-label="Volume horaire" value={r.hoursPerWeek ?? ""} onChange={(e) => updateRow(r.id, { hoursPerWeek: e.target.value ? Number(e.target.value) : null })} />
                          </td>
                          <td style={{ minWidth: 200, fontSize: 12 }}>
                            <div className="muted" title={r.raw}>
                              {r.source}
                            </div>
                            {r.issues.map((issue, i) => (
                              <div key={i} style={{ color: "var(--warning)", display: "flex", gap: 4 }}>
                                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {issue}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onPage={table.setPage} unit="ligne" />
              </section>

              {/* Options + next */}
              <section className="card">
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="imp-mode">Séances déjà saisies</label>
                    <select id="imp-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as "append" | "replace")}>
                      <option value="append">Les conserver et ajouter celles du fichier</option>
                      <option value="replace">Remplacer celles des classes importées</option>
                    </select>
                    {mode === "replace" && (
                      <span className="field-hint" style={{ color: "var(--warning)" }}>
                        Les séances existantes de ces classes seront supprimées définitivement : annuler l&apos;import ne les restaurera pas.
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="imp-term">Période</label>
                    <select id="imp-term" className="input" value={termId} onChange={(e) => setTermId(e.target.value)}>
                      <option value="">Toute l&apos;année</option>
                      {resources?.terms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="btn-row end">
                  {unconfirmed.length > 0 && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {unconfirmed.length} correspondance(s) à confirmer avant de continuer
                    </span>
                  )}
                  <button type="button" className="btn btn-primary" onClick={runPreview} disabled={busy || unconfirmed.length > 0 || !rows.some((r) => r.include)}>
                    {busy ? <LoaderCircle size={16} className="spin" /> : <Wand2 size={16} />} Vérifier et générer l&apos;aperçu
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* ---------------- 4. preview & validation ---------------- */}
      {step === "preview" && preview && (
        <PreviewStep
          preview={preview}
          resources={resources}
          previewClass={previewClass}
          setPreviewClass={setPreviewClass}
          previewErrorsByRow={previewErrorsByRow}
          rows={rows}
          acceptConflicts={acceptConflicts}
          setAcceptConflicts={setAcceptConflicts}
          busy={busy}
          onBack={() => setStep("review")}
          onCommit={commit}
        />
      )}

      {/* ---------------- 5. done ---------------- */}
      {step === "done" && result && (
        <div className="card" style={{ maxWidth: 680 }}>
          <EmptyState icon={<CalendarCheck size={24} />} title={`${result.created} séance(s) importée(s)`}>
            {result.conflictCount > 0 ? `${result.conflictCount} séance(s) restent en conflit et sont signalées dans l'éditeur. ` : "Aucun conflit. "}
            {result.replaced > 0 && `${result.replaced} séance(s) remplacée(s). `}
            {result.skippedRows > 0 && `${result.skippedRows} ligne(s) ignorée(s). `}
            {result.unplaced > 0 && `${result.unplaced} volume(s) n'ont pas pu être placés.`}
          </EmptyState>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button type="button" className="btn btn-primary" onClick={() => router.push(`/timetable?view=class&id=${result.classIds[0] ?? ""}`)}>
              Ouvrir dans l&apos;éditeur <ArrowRight size={16} />
            </button>
            <button type="button" className="btn btn-outline" onClick={reset}>
              Importer un autre fichier
            </button>
            <button type="button" className="btn btn-danger-ghost" onClick={undo}>
              <Undo2 size={16} /> Annuler cet import
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ------------------------------------------------------------------ preview step

function PreviewStep({
  preview,
  resources,
  previewClass,
  setPreviewClass,
  previewErrorsByRow,
  rows,
  acceptConflicts,
  setAcceptConflicts,
  busy,
  onBack,
  onCommit,
}: {
  preview: Preview;
  resources: Resources | null;
  previewClass: string;
  setPreviewClass: (v: string) => void;
  previewErrorsByRow: Map<string, string>;
  rows: EditRow[];
  acceptConflicts: boolean;
  setAcceptConflicts: (v: boolean) => void;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}) {
  const classes = useMemo(() => [...new Set(preview.sessions.map((s) => s.className))].sort(), [preview]);
  const gridSessions: GridSession[] = useMemo(
    () =>
      preview.sessions
        .filter((s) => s.className === previewClass)
        .map((s) => ({
          id: s.key,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          subject: s.subject ? { name: s.subject } : null,
          class: { name: s.className },
          teacher: s.teacher ? { name: s.teacher } : null,
          room: s.room ? { name: s.room } : null,
          conflicts: s.conflicts,
        })),
    [preview, previewClass],
  );
  const conflicted = preview.sessions.filter((s) => hasBlocking(s.conflicts));
  const settings = resources?.settings ?? { days: [1, 2, 3, 4, 5, 6], start: "07:00", end: "18:00", breaks: [], slotMinutes: 30 };
  const toCreate = [...preview.toCreate.class.map((n) => `Classe « ${n} »`), ...preview.toCreate.subject.map((n) => `Matière « ${n} »`), ...preview.toCreate.room.map((n) => `Salle « ${n} »`)];
  const rowLabel = (rowId: string) => rows.find((r) => r.id === rowId)?.source ?? rowId;

  return (
    <div className="stack">
      <div className="kpi-grid" style={{ marginBottom: 0 }}>
        <div className="kpi-card">
          <div className="kpi-label">Séances à créer</div>
          <div className="kpi-value">{preview.sessions.length}</div>
          <div className="kpi-sub">{preview.generatedCount ? `dont ${preview.generatedCount} placées automatiquement` : "telles que lues"}</div>
        </div>
        <div className={`kpi-card${preview.blockingConflicts ? " accent-danger" : ""}`}>
          <div className="kpi-label">Conflits</div>
          <div className="kpi-value">{preview.blockingConflicts}</div>
          <div className="kpi-sub">{preview.warnings ? `${preview.warnings} avertissement(s)` : "enseignant, salle ou classe"}</div>
        </div>
        <div className={`kpi-card${preview.rowErrors.length ? " accent-warning" : ""}`}>
          <div className="kpi-label">Lignes écartées</div>
          <div className="kpi-value">{preview.rowErrors.length}</div>
          <div className="kpi-sub">incomplètes ou invalides</div>
        </div>
        <div className="kpi-card accent-orange">
          <div className="kpi-label">Éléments créés</div>
          <div className="kpi-value">{toCreate.length}</div>
          <div className="kpi-sub">{preview.replaceCount ? `${preview.replaceCount} séance(s) remplacée(s)` : "classes, matières, salles"}</div>
        </div>
      </div>

      {conflicted.length > 0 && (
        <div className="alert alert-danger">
          <OctagonAlert size={17} />
          <div className="alert-body">
            <div className="alert-title">{conflicted.length} séance(s) en conflit</div>
            <ul style={{ margin: "6px 0 0 16px" }}>
              {conflicted.slice(0, 8).map((s) => (
                <li key={s.key}>
                  {s.className} · {s.subject ?? "—"} · {DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime} : {s.conflicts.filter((c) => c.severity === "error").map((c) => c.message).join(" ; ")}
                </li>
              ))}
              {conflicted.length > 8 && <li>… et {conflicted.length - 8} autre(s)</li>}
            </ul>
          </div>
        </div>
      )}
      {preview.rowErrors.length > 0 && (
        <div className="alert alert-warning">
          <AlertTriangle size={17} />
          <div className="alert-body">
            <div className="alert-title">Lignes non importées</div>
            <ul style={{ margin: "6px 0 0 16px" }}>
              {preview.rowErrors.slice(0, 8).map((e) => (
                <li key={e.rowId}>
                  {rowLabel(e.rowId)} : {previewErrorsByRow.get(e.rowId)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {preview.unplaced.length > 0 && (
        <div className="alert alert-warning">
          <AlertTriangle size={17} />
          <div className="alert-body">
            <div className="alert-title">Volumes non placés</div>
            <ul style={{ margin: "6px 0 0 16px" }}>
              {preview.unplaced.map((u, i) => (
                <li key={i}>
                  {u.labels.className} · {u.labels.subject ?? "—"} ({u.minutes} min) : {u.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {toCreate.length > 0 && (
        <div className="alert alert-info">
          <CheckCircle2 size={17} />
          <div className="alert-body">
            <span className="alert-title">Seront créés :</span> {toCreate.join(", ")}
          </div>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Aperçu</h2>
            <p className="card-sub">Emploi du temps tel qu&apos;il sera créé. Les séances en conflit sont hachurées en rouge.</p>
          </div>
          <select className="input" style={{ width: "auto" }} aria-label="Classe affichée" value={previewClass} onChange={(e) => setPreviewClass(e.target.value)}>
            {classes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {gridSessions.length ? (
          <TimetableGrid days={visibleDays(settings, gridSessions)} bounds={gridBounds(settings, gridSessions)} settings={settings} sessions={gridSessions} view="class" pxPerMinute={0.9} />
        ) : (
          <EmptyState title="Aucune séance valide à créer" />
        )}
      </section>

      <div className="card" style={{ position: "sticky", bottom: 12, zIndex: 5, boxShadow: "var(--shadow-lg)" }}>
        <div className="btn-row" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-outline" onClick={onBack} disabled={busy}>
            <ArrowLeft size={16} /> Corriger
          </button>
          <div className="btn-row">
            {preview.blockingConflicts > 0 && (
              <label className="checkbox">
                <input type="checkbox" checked={acceptConflicts} onChange={(e) => setAcceptConflicts(e.target.checked)} />
                Importer malgré les {preview.blockingConflicts} conflit(s)
              </label>
            )}
            <button type="button" className="btn btn-primary" onClick={onCommit} disabled={busy || !preview.sessions.length || (preview.blockingConflicts > 0 && !acceptConflicts)}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <CalendarCheck size={16} />} Importer {preview.sessions.length} séance(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
