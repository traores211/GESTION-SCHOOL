"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Shield, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, PageHeader, TableSkeleton, useFeedback, Modal } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";

interface Domain {
  id: string;
  hostname: string;
  kind: "PLATFORM" | "SUBDOMAIN" | "CUSTOM_DOMAIN" | "CUSTOM_DOMAIN_ALIAS";
  status: "PENDING" | "VERIFYING" | "ACTIVE" | "SUSPENDED" | "FAILED" | "REMOVED";
  isPrimary: boolean;
  verificationToken: string;
  verifiedAt: string | null;
  sslStatus: string;
  sslIssuedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  school: { id: string; name: string; code: string } | null;
  organisation: { id: string; name: string; slug: string } | null;
  verificationRecord: { type: string; name: string; value: string };
}

interface SchoolLite {
  id: string;
  name: string;
  code: string;
}

const STATUS_STYLE: Record<Domain["status"], { label: string; className: string }> = {
  PENDING: { label: "À vérifier", className: "badge badge-info" },
  VERIFYING: { label: "Vérification en cours", className: "badge badge-info" },
  ACTIVE: { label: "Actif", className: "badge badge-green" },
  SUSPENDED: { label: "Suspendu", className: "badge badge-danger" },
  FAILED: { label: "Échec", className: "badge badge-danger" },
  REMOVED: { label: "Retiré", className: "badge" },
};

const KIND_LABEL: Record<Domain["kind"], string> = {
  PLATFORM: "Plateforme",
  SUBDOMAIN: "Sous-domaine",
  CUSTOM_DOMAIN: "Domaine personnalisé",
  CUSTOM_DOMAIN_ALIAS: "Alias",
};

function DomainsContent() {
  const feedback = useFeedback();
  const user = useMemo(() => getStoredUser(), []);
  const canAdd = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN_ORGANISATION" || user?.role === "DIRECTOR";
  const [rows, setRows] = useState<Domain[] | null>(null);
  const [schools, setSchools] = useState<SchoolLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Domain | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ hostname: "", schoolId: "", kind: "CUSTOM_DOMAIN" as Domain["kind"], notes: "" });

  const load = useCallback(() => {
    api
      .get<Domain[]>("/domains")
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(load, [load]);

  // Only load the school list when we actually need to pick one (opening the add form).
  useEffect(() => {
    if (!adding || schools.length) return;
    api
      .get<{ id: string; name: string; code: string }[]>("/auth/schools")
      .then((list) => {
        setSchools(list);
        if (list.length && !form.schoolId) setForm((f) => ({ ...f, schoolId: list[0].id }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding]);

  const submitAdd = async () => {
    if (!form.hostname.trim()) return;
    const schoolId = form.schoolId;
    if (!schoolId) {
      feedback.error("Établissement manquant", "Choisissez un établissement");
      return;
    }
    try {
      const created = await api.post<Domain>(`/schools/${schoolId}/domains`, {
        hostname: form.hostname.trim().toLowerCase(),
        kind: form.kind,
        notes: form.notes || undefined,
      });
      feedback.success("Domaine ajouté", created.hostname);
      setAdding(false);
      setForm({ hostname: "", schoolId: form.schoolId, kind: "CUSTOM_DOMAIN", notes: "" });
      load();
      setOpen(created);
    } catch (err) {
      feedback.error("Création impossible", errorMessage(err));
    }
  };

  const verify = async (d: Domain) => {
    try {
      const res = await api.post<{ ok: boolean; status: string; error?: string }>(`/domains/${d.id}/verify`, {});
      if (res.ok) {
        feedback.success("Domaine vérifié", d.hostname);
      } else {
        feedback.error("Vérification échouée", res.error || "Le jeton attendu n'a pas été trouvé dans la zone DNS");
      }
      load();
      if (open?.id === d.id) {
        const refreshed = await api.get<Domain>(`/domains/${d.id}`);
        setOpen(refreshed);
      }
    } catch (err) {
      feedback.error("Vérification impossible", errorMessage(err));
    }
  };

  const setPrimary = async (d: Domain) => {
    try {
      await api.patch(`/domains/${d.id}`, { isPrimary: true });
      feedback.success("Domaine principal", d.hostname);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    }
  };

  const suspend = async (d: Domain, status: "ACTIVE" | "SUSPENDED") => {
    try {
      await api.patch(`/domains/${d.id}`, { status });
      feedback.success(status === "ACTIVE" ? "Domaine réactivé" : "Domaine suspendu", d.hostname);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    }
  };

  const remove = async (d: Domain) => {
    const yes = await feedback.confirm({
      title: "Supprimer le domaine ?",
      message: `${d.hostname} ne pointera plus vers l'établissement ${d.school?.name ?? ""}. Le journal d'audit garde la trace de cette suppression.`,
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!yes) return;
    try {
      await api.delete(`/domains/${d.id}`);
      feedback.success("Domaine supprimé", d.hostname);
      load();
      setOpen(null);
    } catch (err) {
      feedback.error("Suppression impossible", errorMessage(err));
    }
  };

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      feedback.success("Copié", what);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <PageHeader
        title="Domaines des établissements"
        description="Chaque établissement peut utiliser son propre nom de domaine (par exemple mon-ecole-1.ci). Un domaine ne devient actif qu'après avoir publié l'enregistrement DNS de vérification demandé par la plateforme."
        actions={
          canAdd ? (
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              Ajouter un domaine
            </button>
          ) : null
        }
      />

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Liste indisponible">
            {error}
          </EmptyState>
        ) : !rows ? (
          <TableSkeleton columns={5} rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Globe size={22} />} title="Aucun domaine personnalisé">
            Les visiteurs accèdent pour l&apos;instant aux établissements par leur lien par défaut.
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Domaine</th>
                <th>Établissement</th>
                <th>Type</th>
                <th>État</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="cell-main">
                      {d.hostname}
                      {d.isPrimary && (
                        <span className="badge badge-green" style={{ marginLeft: 8 }}>
                          Principal
                        </span>
                      )}
                    </div>
                    {d.verifiedAt && <div className="cell-sub">Vérifié le {new Date(d.verifiedAt).toLocaleDateString("fr-FR")}</div>}
                    {d.lastError && <div className="cell-sub" style={{ color: "var(--color-danger, #b91c1c)" }}>{d.lastError}</div>}
                  </td>
                  <td>
                    {d.school ? (
                      <>
                        <div className="cell-main">{d.school.name}</div>
                        <div className="cell-sub">{d.school.code}</div>
                      </>
                    ) : (
                      <span className="cell-sub">—</span>
                    )}
                  </td>
                  <td>{KIND_LABEL[d.kind]}</td>
                  <td>
                    <span className={STATUS_STYLE[d.status].className}>{STATUS_STYLE[d.status].label}</span>
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(d)}>
                      Détails
                    </button>
                    {d.status !== "ACTIVE" && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => verify(d)}>
                        Vérifier
                      </button>
                    )}
                    {d.status === "ACTIVE" && !d.isPrimary && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrimary(d)}>
                        Rendre principal
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} size="lg" title={open?.hostname ?? ""} description={open?.school ? `${open.school.name} · ${open.school.code}` : undefined}>
        {open && (
          <div style={{ display: "grid", gap: 16 }}>
            <section>
              <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Vérification DNS</h3>
              <p className="cell-sub" style={{ marginTop: 0 }}>
                Pour prouver que vous contrôlez <strong>{open.hostname}</strong>, créez l&apos;enregistrement DNS ci-dessous chez votre bureau d&apos;enregistrement, puis cliquez sur « Lancer la vérification ».
              </p>
              <div className="card" style={{ padding: 12 }}>
                <div className="cell-sub">Type</div>
                <div className="tabular">{open.verificationRecord.type}</div>
                <div className="cell-sub" style={{ marginTop: 8 }}>Nom</div>
                <div className="tabular" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <code style={{ wordBreak: "break-all" }}>{open.verificationRecord.name}</code>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(open.verificationRecord.name, "Nom DNS")}>Copier</button>
                </div>
                <div className="cell-sub" style={{ marginTop: 8 }}>Valeur</div>
                <div className="tabular" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <code style={{ wordBreak: "break-all" }}>{open.verificationRecord.value}</code>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(open.verificationRecord.value, "Jeton de vérification")}>Copier</button>
                </div>
              </div>
              {open.lastCheckedAt && <div className="cell-sub" style={{ marginTop: 6 }}>Dernière vérification : {new Date(open.lastCheckedAt).toLocaleString("fr-FR")}</div>}
              {open.lastError && (
                <div className="cell-sub" style={{ color: "var(--color-danger, #b91c1c)", marginTop: 6 }}>
                  <ShieldAlert size={14} style={{ display: "inline", marginRight: 4 }} />
                  {open.lastError}
                </div>
              )}
            </section>

            <section>
              <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Statut</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className={STATUS_STYLE[open.status].className}>{STATUS_STYLE[open.status].label}</span>
                {open.isPrimary && <span className="badge badge-green">Domaine principal</span>}
                <span className="cell-sub">
                  <ShieldCheck size={14} style={{ display: "inline", marginRight: 4 }} />
                  Certificat SSL : {open.sslStatus}
                </span>
              </div>
            </section>

            <section style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {open.status !== "ACTIVE" && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => verify(open)}>
                  <Shield size={14} /> Lancer la vérification
                </button>
              )}
              {open.status === "ACTIVE" && !open.isPrimary && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPrimary(open)}>
                  Rendre principal
                </button>
              )}
              {user?.role === "SUPER_ADMIN" && open.status === "ACTIVE" && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => suspend(open, "SUSPENDED")}>
                  Suspendre
                </button>
              )}
              {user?.role === "SUPER_ADMIN" && open.status === "SUSPENDED" && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => suspend(open, "ACTIVE")}>
                  Réactiver
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(open)}>
                <Trash2 size={14} /> Supprimer
              </button>
            </section>
          </div>
        )}
      </Modal>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter un domaine"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setAdding(false)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={submitAdd}>
              Ajouter
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            <span className="cell-sub">Nom de domaine</span>
            <input
              className="input"
              data-autofocus
              placeholder="mon-ecole-1.ci"
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
            />
          </label>
          <label>
            <span className="cell-sub">Établissement</span>
            <select className="input" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
              {schools.length === 0 && <option value="">— aucun —</option>}
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="cell-sub">Type</span>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Domain["kind"] })}>
              <option value="CUSTOM_DOMAIN">Domaine personnalisé</option>
              <option value="CUSTOM_DOMAIN_ALIAS">Alias (par ex. www.…)</option>
              <option value="SUBDOMAIN">Sous-domaine de la plateforme</option>
            </select>
          </label>
          <label>
            <span className="cell-sub">Notes (facultatives)</span>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <p className="cell-sub" style={{ margin: 0 }}>
            Le domaine est créé en attente. La plateforme vous donnera un enregistrement DNS TXT à publier chez votre bureau d&apos;enregistrement avant de le rendre actif.
          </p>
        </div>
      </Modal>
    </>
  );
}

export default function DomainsPage() {
  return (
    <Shell title="Domaines">
      <DomainsContent />
    </Shell>
  );
}
