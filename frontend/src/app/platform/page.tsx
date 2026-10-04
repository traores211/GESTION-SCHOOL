"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

interface Organisation {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED";
  plan: string;
  trialEndsAt: string | null;
  daysLeft: number | null;
  readOnly: boolean;
  schools: { id: string; name: string; code: string; isActive: boolean; students: number; users: number }[];
}

const STATUS = {
  TRIAL: { label: "Essai", badge: "badge-info" },
  ACTIVE: { label: "Abonné", badge: "badge-green" },
  SUSPENDED: { label: "Suspendu", badge: "badge-danger" },
} as const;
const PLANS = ["STARTER", "PRO", "ENTERPRISE"];

function PlatformContent() {
  const feedback = useFeedback();
  const [rows, setRows] = useState<Organisation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const update = async (o: Organisation, patch: { status?: string; plan?: string; trialEndsAt?: string }, done: string) => {
    try {
      await api.patch(`/platform/organisations/${o.id}`, patch);
      feedback.success(done, o.name);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    }
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

  const extend = (o: Organisation) => {
    const from = o.trialEndsAt && new Date(o.trialEndsAt) > new Date() ? new Date(o.trialEndsAt) : new Date();
    return update(o, { status: "TRIAL", trialEndsAt: new Date(from.getTime() + 30 * 86400000).toISOString() }, "Essai prolongé de 30 jours");
  };

  return (
    <>
      <PageHeader title="Établissements de la plateforme" description="Essais en cours, abonnements et taille de chaque établissement. Un établissement dont l'essai est terminé ou suspendu passe en lecture seule." />
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
                    {o.status !== "ACTIVE" && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => update(o, { status: "ACTIVE" }, "Abonnement activé")}>
                        Activer
                      </button>
                    )}
                    {o.status !== "ACTIVE" && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => extend(o)}>
                        +30 jours d&apos;essai
                      </button>
                    )}
                    {o.status !== "SUSPENDED" && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(o, { status: "SUSPENDED" }, "Abonnement suspendu")} aria-label={`Suspendre ${o.name}`}>
                        Suspendre
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
