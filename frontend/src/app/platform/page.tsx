"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import Modal from "../../components/ui/Modal";
import { api, errorMessage } from "../../lib/api";
import { EmptyState, ErrorAlert, SkeletonRows, useToast } from "../../components/ui/States";

interface School {
  id: string;
  name: string;
  code: string;
  city: string | null;
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
  isActive: boolean;
  customDomain: string | null;
  featureOverrides: Record<string, boolean>;
  features: string[];
  counts: { students: number; users: number; classes: number };
}
interface Stats {
  schools: number;
  activeSchools: number;
  students: number;
  users: number;
  aiActions: number;
  documents: number;
}

const FEATURE_LABELS: Record<string, string> = {
  showcase: "Vitrine",
  "showcase.customDomain": "Domaine personnalisé",
  payroll: "Paie",
  transport: "Transport",
  timetable: "Emplois du temps",
  documents: "Documents",
  "ai.chat": "Assistant IA",
  "ai.views": "Tableaux de bord IA",
};
const PLANS = { STARTER: "Starter", PROFESSIONAL: "Professional", ENTERPRISE: "Enterprise" };

export default function PlatformPage() {
  const toast = useToast();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [catalogue, setCatalogue] = useState<{ features: string[]; plans: Record<string, string[]> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<School | null>(null);
  const [created, setCreated] = useState<{ code: string; temporaryPassword: string } | null>(null);
  const [form, setForm] = useState({ name: "", code: "", email: "", city: "", plan: "PROFESSIONAL", directorFirstName: "", directorLastName: "", directorEmail: "" });

  const load = () => {
    setError(null);
    // Independent requests: the school list must not wait for the (slower) statistics.
    api.get<School[]>("/platform/schools").then(setSchools).catch((err) => setError(errorMessage(err)));
    api.get<Stats>("/platform/stats").then(setStats).catch(() => {});
    api.get<typeof catalogue>("/platform/catalogue").then(setCatalogue).catch(() => {});
  };
  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.post<{ code: string; temporaryPassword: string }>("/platform/schools", { ...form, city: form.city || undefined });
      setCreating(false);
      setCreated(r);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const update = async (school: School, patch: Partial<Pick<School, "plan" | "isActive" | "customDomain" | "featureOverrides">>) => {
    try {
      await api.patch(`/platform/schools/${school.id}`, patch);
      toast("École mise à jour");
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Shell title="Plateforme">
      <div className="page-header">
        <div>
          <h1>Écoles et plans</h1>
          <p>Console de l&apos;opérateur SaaS. Aucune donnée d&apos;élève n&apos;est accessible depuis cet espace.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Nouvelle école
        </button>
      </div>
      <ErrorAlert message={error} onRetry={load} />

      {stats && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Écoles actives</div>
            <div className="kpi-value">
              {stats.activeSchools} / {stats.schools}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Élèves gérés</div>
            <div className="kpi-value">{stats.students}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Comptes utilisateurs</div>
            <div className="kpi-value">{stats.users}</div>
          </div>
          <div className="kpi-card accent-orange">
            <div className="kpi-label">Actions IA / documents générés</div>
            <div className="kpi-value">
              {stats.aiActions} / {stats.documents}
            </div>
          </div>
        </div>
      )}

      {!schools ? (
        <SkeletonRows />
      ) : schools.length === 0 ? (
        <EmptyState title="Aucune école" action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Créer la première école</button>} />
      ) : (
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>École</th>
                <th>Plan</th>
                <th className="num">Élèves</th>
                <th>Modules actifs</th>
                <th>Statut</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id}>
                  <td data-label="École">
                    <strong>{s.name}</strong>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {s.code}
                      {s.customDomain ? ` · ${s.customDomain}` : ""}
                      {s.city ? ` · ${s.city}` : ""}
                    </div>
                  </td>
                  <td data-label="Plan">
                    <label className="sr-only" htmlFor={`plan-${s.id}`}>
                      Plan de {s.name}
                    </label>
                    <select id={`plan-${s.id}`} className="input" style={{ minHeight: 34 }} value={s.plan} onChange={(e) => update(s, { plan: e.target.value as School["plan"] })}>
                      {Object.entries(PLANS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Élèves" className="num">
                    {s.counts.students}
                  </td>
                  <td data-label="Modules" style={{ fontSize: 12.5 }}>
                    {s.features.map((f) => FEATURE_LABELS[f] ?? f).join(", ")}
                  </td>
                  <td data-label="Statut">
                    <span className={`badge ${s.isActive ? "badge-green" : "badge-danger"}`}>{s.isActive ? "Active" : "Suspendue"}</span>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(s)}>
                      Modules
                    </button>{" "}
                    <button type="button" className={`btn btn-sm ${s.isActive ? "btn-outline" : "btn-primary"}`} onClick={() => update(s, { isActive: !s.isActive })}>
                      {s.isActive ? "Suspendre" : "Réactiver"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <Modal title="Nouvelle école" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <div className="form-grid">
              {(
                [
                  ["name", "Nom de l'école", "text"],
                  ["code", "Code (sous-domaine)", "text"],
                  ["email", "Email de l'école", "email"],
                  ["city", "Ville", "text"],
                  ["directorFirstName", "Prénom du directeur", "text"],
                  ["directorLastName", "Nom du directeur", "text"],
                  ["directorEmail", "Email du directeur", "email"],
                ] as const
              ).map(([k, label, type]) => (
                <div className="field" key={k}>
                  <label htmlFor={`new-${k}`}>{label}</label>
                  <input
                    id={`new-${k}`}
                    className="input"
                    type={type}
                    required={k !== "city"}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: k === "code" ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") : e.target.value })}
                    aria-describedby={k === "code" ? "new-code-hint" : undefined}
                  />
                  {k === "code" && (
                    <span id="new-code-hint" className="field-hint">
                      Minuscules, chiffres et tirets. Donne l&apos;adresse {form.code || "code"}.votre-domaine
                    </span>
                  )}
                </div>
              ))}
              <div className="field">
                <label htmlFor="new-plan">Plan</label>
                <select id="new-plan" className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                  {Object.entries(PLANS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setCreating(false)}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary">
                Créer l&apos;école
              </button>
            </div>
          </form>
        </Modal>
      )}

      {created && (
        <Modal title="École créée" onClose={() => setCreated(null)}>
          <p>
            L&apos;espace <strong>{created.code}</strong> est prêt. Un email d&apos;accès a été envoyé au directeur. Mot de passe provisoire (affiché une seule fois) :
          </p>
          <code style={{ display: "block", margin: "12px 0", padding: 12, background: "var(--surface-2)", borderRadius: 8, fontSize: 16 }}>{created.temporaryPassword}</code>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>
              J&apos;ai noté le mot de passe
            </button>
          </div>
        </Modal>
      )}

      {editing && catalogue && (
        <Modal title={`Modules — ${editing.name}`} onClose={() => setEditing(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>
            Par défaut, les modules suivent le plan {PLANS[editing.plan]}. Cochez ou décochez pour faire une exception à cette école (déploiement progressif).
          </p>
          <div className="stack">
            {catalogue.features.map((f) => {
              const inPlan = catalogue.plans[editing.plan].includes(f);
              const override = editing.featureOverrides[f];
              const enabled = override ?? inPlan;
              return (
                <label key={f} className="toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                      const next = { ...editing.featureOverrides };
                      if (e.target.checked === inPlan) delete next[f];
                      else next[f] = e.target.checked;
                      setEditing({ ...editing, featureOverrides: next });
                    }}
                  />
                  {FEATURE_LABELS[f] ?? f}
                  {override !== undefined && <span className="badge badge-orange">exception</span>}
                </label>
              );
            })}
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="edit-domain">Domaine personnalisé</label>
            <input id="edit-domain" className="input" placeholder="ecole-exemple.com" value={editing.customDomain ?? ""} onChange={(e) => setEditing({ ...editing, customDomain: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await update(editing, { featureOverrides: editing.featureOverrides, customDomain: editing.customDomain ?? "" });
                setEditing(null);
              }}
            >
              Enregistrer
            </button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
