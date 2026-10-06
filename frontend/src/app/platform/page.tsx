"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, History } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, Modal, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

type LifecycleStatus = "PROSPECT" | "PENDING" | "TRIAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CLOSED";

interface Organisation {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  status: LifecycleStatus;
  plan: string;
  trialEndsAt: string | null;
  daysLeft: number | null;
  readOnly: boolean;
  loginAllowed?: boolean;
  schools: { id: string; name: string; code: string; isActive: boolean; students: number; users: number }[];
}

interface LifecycleEvent {
  id: string;
  fromStatus: LifecycleStatus | null;
  fromStatusLabel: string | null;
  toStatus: LifecycleStatus;
  toStatusLabel: string;
  fromPlan: string | null;
  toPlan: string | null;
  trialEndsAt: string | null;
  reason: string;
  reasonLabel: string;
  message: string | null;
  trigger: "MANUAL" | "SIGNUP" | "AUTO";
  operator: { id: string | null; name: string; email: string | null } | null;
  createdAt: string;
}

const STATUS: Record<LifecycleStatus, { label: string; badge: string }> = {
  PROSPECT: { label: "Prospect", badge: "badge-neutral" },
  PENDING: { label: "En attente", badge: "badge-neutral" },
  TRIAL: { label: "Essai", badge: "badge-info" },
  ACTIVE: { label: "Abonné", badge: "badge-green" },
  SUSPENDED: { label: "Suspendu", badge: "badge-danger" },
  EXPIRED: { label: "Essai terminé", badge: "badge-warning" },
  CLOSED: { label: "Clôturé", badge: "badge-danger" },
};
const PLANS = ["STARTER", "PRO", "ENTERPRISE"];
/** Allowed transitions mirror backend/src/platform/lifecycle.ts (kept short so the UI stays simple). */
const CAN_GO: Record<LifecycleStatus, LifecycleStatus[]> = {
  PROSPECT: ["PENDING", "TRIAL", "ACTIVE", "CLOSED"],
  PENDING: ["TRIAL", "ACTIVE", "CLOSED"],
  TRIAL: ["ACTIVE", "EXPIRED", "SUSPENDED", "CLOSED"],
  ACTIVE: ["TRIAL", "SUSPENDED", "EXPIRED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "TRIAL", "CLOSED"],
  EXPIRED: ["ACTIVE", "TRIAL", "CLOSED"],
  CLOSED: [],
};

function PlatformContent() {
  const feedback = useFeedback();
  const [rows, setRows] = useState<Organisation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ organisations: number; schools: number; activeSchools: number; students: number; parents: number; teachers: number; admissionsInProgress: number } | null>(null);
  const [history, setHistory] = useState<{ org: Organisation; events: LifecycleEvent[] | null } | null>(null);

  useEffect(() => {
    api.get<NonNullable<typeof stats>>("/dashboard/platform").then(setStats).catch(() => {});
  }, []);

  const load = useCallback(() => {
    api
      .get<Organisation[]>("/platform/organisations")
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const update = async (o: Organisation, patch: { status?: string; plan?: string; trialEndsAt?: string; message?: string }, done: string) => {
    try {
      await api.patch(`/platform/organisations/${o.id}`, patch);
      feedback.success(done, o.name);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    }
  };

  const transition = async (o: Organisation, to: LifecycleStatus, labelDone: string) => {
    if (to === "CLOSED") {
      const yes = await feedback.confirm({
        title: "Clôturer l'établissement ?",
        message: `${o.name} ne pourra plus se connecter. L'historique de l'organisation reste consultable depuis cette page.`,
        confirmLabel: "Clôturer",
        tone: "danger",
      });
      if (!yes) return;
    }
    await update(o, { status: to }, labelDone);
    if (history?.org.id === o.id) openHistory(o);
  };

  const extend = (o: Organisation) => {
    const from = o.trialEndsAt && new Date(o.trialEndsAt) > new Date() ? new Date(o.trialEndsAt) : new Date();
    return update(o, { status: "TRIAL", trialEndsAt: new Date(from.getTime() + 30 * 86400000).toISOString() }, "Essai prolongé de 30 jours");
  };

  const setSchoolActive = async (school: Organisation["schools"][number], isActive: boolean) => {
    try {
      await api.patch(`/platform/schools/${school.id}`, { isActive });
      feedback.success(isActive ? "Établissement réactivé" : "Établissement désactivé", school.name);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    }
  };

  const openHistory = (o: Organisation) => {
    setHistory({ org: o, events: null });
    api
      .get<{ events: LifecycleEvent[] }>(`/platform/organisations/${o.id}/history`)
      .then((r) => setHistory({ org: o, events: r.events }))
      .catch((err) => feedback.error("Historique indisponible", errorMessage(err)));
  };

  const closeHistory = () => setHistory(null);

  const quickActionLabel: Record<LifecycleStatus, string> = {
    PROSPECT: "Prospect",
    PENDING: "Mettre en attente",
    TRIAL: "Démarrer un essai",
    ACTIVE: "Activer",
    SUSPENDED: "Suspendre",
    EXPIRED: "Marquer l'essai terminé",
    CLOSED: "Clôturer",
  };

  return (
    <>
      <PageHeader title="Établissements de la plateforme" description="Essais en cours, abonnements et taille de chaque établissement. Un établissement dont l'essai est terminé ou suspendu passe en lecture seule." />
      {stats && (
        <div className="stat-row" style={{ marginBottom: 18 }}>
          {[
            ["Groupes", stats.organisations],
            ["Établissements actifs", `${stats.activeSchools} / ${stats.schools}`],
            ["Élèves", stats.students],
            ["Parents", stats.parents],
            ["Enseignants", stats.teachers],
            ["Admissions en cours", stats.admissionsInProgress],
          ].map(([label, value]) => (
            <div className="card" key={label as string} style={{ padding: "12px 16px" }}>
              <div className="cell-sub">{label}</div>
              <div className="tabular" style={{ fontSize: 24, fontWeight: 600 }}>
                {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Liste indisponible">
            {error}
          </EmptyState>
        ) : !rows ? (
          <TableSkeleton columns={5} rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Building2 size={22} />} title="Aucun établissement" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Établissement</th>
                <th className="num">Élèves</th>
                <th>Abonnement</th>
                <th>Formule</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div className="cell-main">{o.name}</div>
                    <div className="cell-sub">
                      {o.email} · inscrit le {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                    {o.schools.map((s) => (
                      <div className="cell-sub" key={s.id}>
                        {s.name} ({s.code}){" "}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSchoolActive(s, !s.isActive)} aria-label={`${s.isActive ? "Désactiver" : "Réactiver"} ${s.name}`}>
                          {s.isActive ? "Désactiver" : "Réactiver (désactivé)"}
                        </button>
                      </div>
                    ))}
                  </td>
                  <td className="num">{o.schools.reduce((n, s) => n + s.students, 0)}</td>
                  <td>
                    <span className={`badge ${STATUS[o.status].badge}`}>{STATUS[o.status].label}</span>
                    {o.status === "TRIAL" && <div className="cell-sub">{o.readOnly ? "Essai terminé : lecture seule" : `${o.daysLeft} jour(s) restant(s)`}</div>}
                    {o.status === "EXPIRED" && <div className="cell-sub">Lecture seule — en attente de paiement</div>}
                    {o.status === "SUSPENDED" && <div className="cell-sub">Suspendu par la plateforme</div>}
                    {o.status === "CLOSED" && <div className="cell-sub">Clôturé — la connexion est fermée</div>}
                  </td>
                  <td>
                    <select className="input input-sm" aria-label={`Formule de ${o.name}`} value={o.plan} onChange={(e) => update(o, { plan: e.target.value }, "Formule modifiée")}>
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="actions">
                    {CAN_GO[o.status].includes("ACTIVE") && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => transition(o, "ACTIVE", "Abonnement activé")}>
                        Activer
                      </button>
                    )}
                    {(o.status === "TRIAL" || CAN_GO[o.status].includes("TRIAL")) && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => extend(o)}>
                        +30 jours d&apos;essai
                      </button>
                    )}
                    {CAN_GO[o.status].includes("SUSPENDED") && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => transition(o, "SUSPENDED", "Abonnement suspendu")} aria-label={`Suspendre ${o.name}`}>
                        Suspendre
                      </button>
                    )}
                    {CAN_GO[o.status].includes("CLOSED") && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => transition(o, "CLOSED", "Établissement clôturé")}>
                        {quickActionLabel.CLOSED}
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistory(o)} aria-label={`Historique de ${o.name}`}>
                      <History size={14} /> Historique
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!history}
        onClose={closeHistory}
        size="lg"
        title={history ? `Historique du cycle de vie — ${history.org.name}` : ""}
        description="Toutes les transitions d'état enregistrées, de la plus récente à la plus ancienne."
      >
        {history && (
          <div>
            {!history.events ? (
              <div className="cell-sub">Chargement…</div>
            ) : history.events.length === 0 ? (
              <EmptyState title="Aucun événement" />
            ) : (
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                {history.events.map((e) => (
                  <li key={e.id} className="card" style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {e.fromStatusLabel && (
                          <>
                            <span className={`badge ${STATUS[e.fromStatus as LifecycleStatus].badge}`}>{e.fromStatusLabel}</span>
                            <span className="cell-sub">→</span>
                          </>
                        )}
                        <span className={`badge ${STATUS[e.toStatus].badge}`}>{e.toStatusLabel}</span>
                        <span className="cell-sub">· {e.reasonLabel}</span>
                      </div>
                      <div className="cell-sub tabular">
                        {new Date(e.createdAt).toLocaleString("fr-FR")}
                        {e.trigger === "AUTO" && " · automatique"}
                        {e.trigger === "SIGNUP" && " · inscription"}
                      </div>
                    </div>
                    {(e.toPlan || e.trialEndsAt) && (
                      <div className="cell-sub" style={{ marginTop: 6 }}>
                        {e.toPlan && <>Formule : <strong>{e.toPlan}</strong></>}
                        {e.toPlan && e.trialEndsAt && " · "}
                        {e.trialEndsAt && <>Essai jusqu&apos;au <strong>{new Date(e.trialEndsAt).toLocaleDateString("fr-FR")}</strong></>}
                      </div>
                    )}
                    {e.message && <div className="cell-sub" style={{ marginTop: 6 }}>{e.message}</div>}
                    {e.operator && <div className="cell-sub" style={{ marginTop: 6 }}>Par {e.operator.name}{e.operator.email ? ` (${e.operator.email})` : ""}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

export default function PlatformPage() {
  return (
    <Shell title="Plateforme">
      <PlatformContent />
    </Shell>
  );
}
