"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, UserPlus, UserRound } from "lucide-react";
import Shell from "../../components/Shell";
import { Avatar, EmptyState, FormError, Modal, PageHeader, Pagination, SearchInput, SortHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useTable } from "../../lib/useTable";
import { getStoredUser } from "../../lib/auth";
import StaffFileModal, { STAFF_CATEGORIES } from "../../components/StaffFileModal";

interface StaffRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  staffMember: { position: string; department?: string; category?: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  DIRECTOR: "Directeur",
  SECRETARY: "Secrétaire",
  COMPTABLE: "Comptable",
  ENSEIGNANT: "Enseignant",
  SURVEILLANT: "Surveillant",
  EDUCATEUR: "Éducateur",
};

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_FORM = { firstName: "", lastName: "", email: "", role: "ENSEIGNANT", position: "", hireDate: today() };

export default function StaffPage() {
  const feedback = useFeedback();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const canManage = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"].includes(getStoredUser()?.role ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; temporaryPassword?: string } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fileOf, setFileOf] = useState<string | null>(null);

  const load = useCallback(() => {
    setStaff(null);
    api
      .get<StaffRow[]>(`/staff${showArchived ? "?archived=true" : ""}`)
      .then((list) => {
        setStaff(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [showArchived]);
  useEffect(load, [load]);

  /** Deactivating or archiving an account closes its sessions at once; nothing is deleted. */
  const setStatus = async (s: StaffRow, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") => {
    const name = `${s.firstName} ${s.lastName}`;
    if (status !== "ACTIVE") {
      const yes = await feedback.confirm({
        title: status === "ARCHIVED" ? `Archiver le compte de ${name} ?` : `Désactiver le compte de ${name} ?`,
        message:
          status === "ARCHIVED"
            ? "La personne quitte la liste du personnel et ne peut plus se connecter. Son historique (cours, notes saisies, bulletins de paie) est conservé."
            : "La personne ne peut plus se connecter tant que le compte n'est pas réactivé. Ses sessions ouvertes sont fermées immédiatement.",
        confirmLabel: status === "ARCHIVED" ? "Archiver" : "Désactiver",
        tone: "warning",
      });
      if (!yes) return;
    }
    try {
      await api.patch(`/staff/${s.id}/status`, { status });
      feedback.success(status === "ACTIVE" ? "Compte réactivé" : status === "ARCHIVED" ? "Compte archivé" : "Compte désactivé", name);
      load();
    } catch (err) {
      feedback.error("Changement impossible", errorMessage(err));
    }
  };

  const table = useTable<StaffRow, "name" | "role" | "position">({
    rows: (staff ?? []).filter((s) => !roleFilter || s.role === roleFilter),
    accessors: { name: (s) => `${s.lastName} ${s.firstName}`, role: (s) => ROLE_LABELS[s.role] ?? s.role, position: (s) => s.staffMember?.position },
    searchText: (s) => `${s.firstName} ${s.lastName} ${s.email} ${s.staffMember?.position ?? ""}`,
    initialSort: { key: "name", dir: "asc" },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.post<{ email: string; temporaryPassword?: string }>("/staff", { ...form, email: form.email.trim().toLowerCase() });
      setCreated(res);
      setForm({ ...EMPTY_FORM, hireDate: today() });
      feedback.success("Compte créé", res.email);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setShowForm(false);
    setCreated(null);
    setFormError(null);
  };

  return (
    <Shell title="Personnel">
      <PageHeader
        title="Personnel"
        description={staff ? `${staff.length} membre(s) : enseignants, direction, secrétariat et comptabilité.` : "Chargement…"}
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <UserPlus size={16} /> Nouveau membre
          </button>
        }
      />

      <div className="table-toolbar">
        <div className="table-toolbar-left">
          <SearchInput value={table.query} onChange={table.setQuery} placeholder="Nom, email, poste…" label="Rechercher un membre du personnel" />
          <select className="input" style={{ width: "auto" }} aria-label="Filtrer par rôle" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Tous les rôles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Comptes archivés
          </label>
        </div>
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Impossible de charger le personnel" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        ) : !staff ? (
          <TableSkeleton columns={6} />
        ) : table.total === 0 ? (
          <EmptyState icon={<UserRound size={22} />} title={table.query || roleFilter ? "Aucun résultat" : "Aucun membre du personnel"} />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Nom" column="name" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Rôle" column="role" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Poste" column="position" sort={table.sort} onSort={table.toggleSort} />
                  <th>Email</th>
                  <th>Compte</th>
                  <th className="actions">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size="sm" />
                        <span className="cell-main">
                          {s.lastName} {s.firstName}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${s.role === "ENSEIGNANT" ? "badge-green" : s.role === "DIRECTOR" ? "badge-orange" : "badge-info"}`}>{ROLE_LABELS[s.role] || s.role}</span>
                    </td>
                    <td>
                      {s.staffMember?.position || <span className="muted">—</span>}
                      {s.staffMember?.category && <div className="cell-sub">{STAFF_CATEGORIES[s.staffMember.category] ?? s.staffMember.category}</div>}
                    </td>
                    <td>
                      <a href={`mailto:${s.email}`}>{s.email}</a>
                    </td>
                    <td>
                      <span className={`badge ${s.status === "INACTIVE" ? "badge-warning" : s.status === "ARCHIVED" ? "badge-neutral" : "badge-green"}`}>
                        {s.status === "INACTIVE" ? "Désactivé" : s.status === "ARCHIVED" ? "Archivé" : "Actif"}
                      </span>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setFileOf(s.id)} aria-label={`Dossier de ${s.firstName} ${s.lastName}`}>
                        Dossier
                      </button>
                      {canManage && s.status !== "ACTIVE" && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setStatus(s, "ACTIVE")}>
                          Réactiver
                        </button>
                      )}
                      {canManage && s.status === "ACTIVE" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(s, "INACTIVE")} aria-label={`Désactiver le compte de ${s.firstName} ${s.lastName}`}>
                          Désactiver
                        </button>
                      )}
                      {canManage && s.status !== "ARCHIVED" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(s, "ARCHIVED")} aria-label={`Archiver le compte de ${s.firstName} ${s.lastName}`}>
                          Archiver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onPage={table.setPage} unit="membre" />
          </>
        )}
      </div>

      <StaffFileModal staffId={fileOf} canEdit={canManage} onClose={() => setFileOf(null)} onSaved={load} />

      <Modal
        open={showForm}
        onClose={close}
        busy={saving}
        title={created ? "Compte créé" : "Nouveau membre du personnel"}
        footer={
          created ? (
            <button className="btn btn-primary" onClick={close}>
              Terminer
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={close} disabled={saving}>
                Annuler
              </button>
              <button type="submit" form="staff-form" className="btn btn-primary" disabled={saving}>
                {saving ? <LoaderCircle size={16} className="spin" /> : <UserPlus size={16} />} Créer le compte
              </button>
            </>
          )
        }
      >
        {created ? (
          <div>
            <div className="conflict-ok" style={{ marginBottom: 14 }}>
              <CheckCircle2 size={16} /> Compte créé pour <strong>{created.email}</strong>
            </div>
            {created.temporaryPassword && (
              <>
                <p style={{ fontSize: 13.5, marginBottom: 8 }}>Mot de passe temporaire, à transmettre à la personne (il ne sera plus affiché) :</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <code className="input" style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.05em" }}>
                    {created.temporaryPassword}
                  </code>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigator.clipboard?.writeText(created.temporaryPassword!).then(() => feedback.success("Mot de passe copié"))}
                  >
                    <Copy size={16} /> Copier
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <form id="staff-form" onSubmit={handleCreate}>
            <FormError message={formError} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="sf-first" className="required">
                  Prénom
                </label>
                <input id="sf-first" className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="sf-last" className="required">
                  Nom
                </label>
                <input id="sf-last" className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="field full">
                <label htmlFor="sf-email" className="required">
                  Email
                </label>
                <input id="sf-email" type="email" className="input" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <span className="field-hint">Sert d&apos;identifiant de connexion.</span>
              </div>
              <div className="field">
                <label htmlFor="sf-role">Rôle</label>
                <select id="sf-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {Object.entries(ROLE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <span className="field-hint">Détermine les menus et droits d&apos;accès.</span>
              </div>
              <div className="field">
                <label htmlFor="sf-position" className="required">
                  Poste
                </label>
                <input id="sf-position" className="input" required placeholder="Ex. Professeur de Maths" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
              <div className="field full">
                <label htmlFor="sf-hire" className="required">
                  Date d&apos;embauche
                </label>
                <input id="sf-hire" type="date" className="input" required value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
              </div>
            </div>
          </form>
        )}
      </Modal>
    </Shell>
  );
}
