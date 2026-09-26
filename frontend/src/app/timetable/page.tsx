"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/session";
import { EmptyState, ErrorAlert, SkeletonRows, useToast } from "../../components/ui/States";

const DAYS: Record<number, string> = { 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" };

interface Settings {
  days: number[];
  periodsPerDay: number;
  periodLabels: string[];
}
interface Entry {
  id?: string;
  day: number;
  period: number;
  subject?: { name: string };
  teacher?: { user: { firstName: string; lastName: string } } | null;
  room?: { name: string } | null;
  timetable?: { class: { name: string } };
}
interface Conflict {
  type: string;
  severity: "error" | "warning";
  message: string;
  day?: number;
  period?: number;
  subjectId?: string;
}

function Grid({ settings, entries, conflicts = [], showClass = false }: { settings: Settings; entries: Entry[]; conflicts?: Conflict[]; showClass?: boolean }) {
  const at = (d: number, p: number) => entries.find((e) => e.day === d && e.period === p);
  const conflictAt = (d: number, p: number) => conflicts.find((c) => c.day === d && c.period === p && c.severity === "error");
  return (
    <div className="table-wrap" style={{ padding: 8 }}>
      <table aria-label="Emploi du temps" style={{ minWidth: 640 }}>
        <thead>
          <tr>
            <th scope="col">Heure</th>
            {settings.days.map((d) => (
              <th key={d} scope="col">
                {DAYS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: settings.periodsPerDay }, (_, i) => i + 1).map((p) => (
            <tr key={p}>
              <th scope="row" style={{ whiteSpace: "nowrap" }}>
                {settings.periodLabels[p - 1] ?? `H${p}`}
              </th>
              {settings.days.map((d) => {
                const e = at(d, p);
                const c = conflictAt(d, p);
                return (
                  <td key={d} style={{ padding: 4 }}>
                    <div className={`tt-cell${e ? " filled" : ""}${c ? " conflict" : ""}`} title={c?.message}>
                      {e && (
                        <>
                          <strong>{e.subject?.name}</strong>
                          <div className="muted">
                            {showClass ? e.timetable?.class.name : e.teacher ? `${e.teacher.user.firstName.slice(0, 1)}. ${e.teacher.user.lastName}` : "—"}
                          </div>
                          {e.room && <div className="muted">{e.room.name}</div>}
                        </>
                      )}
                      {c && <span className="sr-only">Conflit : {c.message}</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TimetablePage() {
  const { can } = useSession();
  const toast = useToast();
  const manager = can("timetable:write");
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<"PUBLISHED" | "DRAFT">("PUBLISHED");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeDay, setFreeDay] = useState("3");
  const [freeFrom, setFreeFrom] = useState("5");
  const [maxPerDay, setMaxPerDay] = useState("2");
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    if (!manager) {
      api
        .get<{ settings: Settings; entries: Entry[] }>("/timetable/mine")
        .then((r) => {
          setSettings(r.settings);
          setEntries(r.entries);
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
      return;
    }
    api
      .get<{ id: string; name: string }[]>("/classes")
      .then((c) => {
        setClasses(c);
        if (c[0]) setClassId(c[0].id);
        else setLoading(false);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  }, [manager]);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ settings: Settings; timetable: { entries: Entry[] } | null }>(`/timetable/classes/${classId}?status=${status}`);
      setSettings(r.settings);
      setEntries(r.timetable?.entries ?? []);
      if (status === "DRAFT" && r.timetable) {
        const c = await api.get<{ conflicts: Conflict[] }>(`/timetable/classes/${classId}/check`);
        setConflicts(c.conflicts);
      } else setConflicts([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classId, status]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (all: boolean) => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const from = Number(freeFrom);
      const blockedSlots = freeDay ? Array.from({ length: Math.max(0, (settings?.periodsPerDay ?? 7) - from + 1) }, (_, i) => ({ day: Number(freeDay), period: from + i })) : [];
      const r = await api.post<{ classes: number; placed: number; unplaced: { missing: number }[]; conflicts: Conflict[] }>("/timetable/generate", {
        classIds: all ? undefined : [classId],
        constraints: { maxPerDayPerSubject: Number(maxPerDay), blockedSlots },
      });
      const missing = r.unplaced.reduce((s, u) => s + u.missing, 0);
      setReport(`${r.classes} classe(s), ${r.placed} heures placées${missing ? `, ${missing} heure(s) impossibles à placer` : ""}.`);
      setStatus("DRAFT");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/timetable/classes/${classId}/publish`);
      toast("Emploi du temps publié — les enseignants sont notifiés");
      setStatus("PUBLISHED");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const blocking = conflicts.filter((c) => c.severity === "error");
  const className = classes.find((c) => c.id === classId)?.name ?? "";

  return (
    <Shell title="Emplois du temps">
      <div className="page-header">
        <div>
          <h1>{manager ? "Emplois du temps" : "Mon emploi du temps"}</h1>
          <p>{manager ? "Générez un brouillon sans conflit, vérifiez-le, puis publiez-le." : "Cours publiés pour la semaine type."}</p>
        </div>
        {manager && classId && status === "PUBLISHED" && entries.length > 0 && (
          <div className="row no-print">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => api.download(`/timetable/classes/${classId}/export.csv`, `edt-${className}.csv`)}>
              Excel (CSV)
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => api.download(`/timetable/classes/${classId}/export.ics`, `edt-${className}.ics`)}>
              Calendrier (.ics)
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
              Imprimer / PDF
            </button>
          </div>
        )}
      </div>

      <ErrorAlert message={error} onRetry={load} />

      {manager && (
        <div className="card no-print" style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="tt-class">Classe</label>
              <select id="tt-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label" id="tt-version">Version</span>
              <div className="tabs" role="tablist" aria-labelledby="tt-version" style={{ marginBottom: 0 }}>
                {(["PUBLISHED", "DRAFT"] as const).map((s) => (
                  <button key={s} type="button" role="tab" className="tab" aria-selected={status === s} onClick={() => setStatus(s)}>
                    {s === "PUBLISHED" ? "Publié" : "Brouillon"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Générer un brouillon</summary>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="tt-max">Heures max d&apos;une matière par jour</label>
                <input id="tt-max" className="input" type="number" min={1} max={6} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="tt-free">Demi-journée libérée</label>
                <select id="tt-free" className="input" value={freeDay} onChange={(e) => setFreeDay(e.target.value)}>
                  <option value="">Aucune</option>
                  {settings?.days.map((d) => (
                    <option key={d} value={d}>
                      {DAYS[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="tt-from">À partir de l&apos;heure n°</label>
                <input id="tt-from" className="input" type="number" min={1} max={settings?.periodsPerDay ?? 12} value={freeFrom} onChange={(e) => setFreeFrom(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={busy || !classId} onClick={() => generate(false)}>
                {busy ? "Génération…" : `Générer pour ${className || "la classe"}`}
              </button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => generate(true)}>
                Générer pour toutes les classes
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 8 }}>
              Les heures par matière se règlent dans la classe (matières affectées). Les emplois du temps déjà publiés des autres classes sont respectés.
            </p>
          </details>
          {report && (
            <div className="alert alert-info" role="status" style={{ marginTop: 12 }}>
              {report}
            </div>
          )}
        </div>
      )}

      {status === "DRAFT" && entries.length > 0 && (
        <div className={`alert ${blocking.length ? "alert-error" : "alert-success"} row`} role="status" style={{ justifyContent: "space-between" }}>
          <span>
            {blocking.length
              ? `${blocking.length} conflit(s) bloquant(s) : ${[...new Set(blocking.map((c) => c.message))].slice(0, 3).join(" ; ")}`
              : conflicts.length
                ? `Aucun conflit bloquant (${conflicts.length} avertissement(s)).`
                : "Aucun conflit détecté."}
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || blocking.length > 0} onClick={publish}>
            Publier
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={7} height={40} />
      ) : settings && entries.length > 0 ? (
        <Grid settings={settings} entries={entries} conflicts={conflicts} showClass={!manager} />
      ) : (
        <EmptyState
          title={status === "DRAFT" ? "Aucun brouillon" : "Aucun emploi du temps publié"}
          text={manager ? "Générez un brouillon avec le formulaire ci-dessus." : "La direction n'a pas encore publié d'emploi du temps."}
        />
      )}
    </Shell>
  );
}
