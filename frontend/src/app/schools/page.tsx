"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, LoaderCircle, Plus, Trash2, Users } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { AuthUser, ROLE_LABELS, setSession } from "../../lib/auth";

interface GroupSchool {
  id: string;
  name: string;
  code: string;
  city: string | null;
  phone: string | null;
  isActive: boolean;
  current: boolean;
  students: number;
  classes: number;
  members: number;
}

interface Member {
  userId: string;
  name: string;
  email: string;
  status: string;
  role: string;
  open: boolean;
}

const MEMBER_ROLES = ["DIRECTOR", "SECRETARY", "COMPTABLE", "ENSEIGNANT", "SURVEILLANT", "EDUCATEUR"];
const EMPTY = { name: "", city: "", phone: "" };

function SchoolsContent() {
  const feedback = useFeedback();
  const [rows, setRows] = useState<GroupSchool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<GroupSchool | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invite, setInvite] = useState({ email: "", role: "ENSEIGNANT" });
  const [memberError, setMemberError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<GroupSchool[]>("/group/schools")
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const school = await api.post<GroupSchool>("/group/schools", { name: form.name, ...(form.city ? { city: form.city } : {}), ...(form.phone ? { phone: form.phone } : {}) });
      feedback.success("Établissement créé", `${school.name} (${school.code}) : année scolaire et trimestres prêts.`);
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (s: GroupSchool, isActive: boolean) => {
    try {
      await api.patch(`/group/schools/${s.id}`, { isActive });
      feedback.success(isActive ? "Établissement réactivé" : "Établissement désactivé", s.name);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    }
  };

  // Opening a school changes what every screen shows: the app restarts on the dashboard.
  const openSchool = async (s: GroupSchool) => {
    try {
      const result = await api.post<{ accessToken: string; user: AuthUser }>("/auth/switch-school", { schoolId: s.id });
      setSession(result.accessToken, result.user);
      window.location.href = "/dashboard";
    } catch (err) {
      feedback.error("Ouverture impossible", errorMessage(err));
    }
  };

  const showMembers = (s: GroupSchool) => {
    setSelected(s);
    setMembers(null);
    setMemberError(null);
    api
      .get<Member[]>(`/group/schools/${s.id}/members`)
      .then(setMembers)
      .catch((err) => setMemberError(errorMessage(err)));
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setMemberError(null);
    try {
      setMembers(await api.post<Member[]>(`/group/schools/${selected.id}/members`, invite));
      setInvite({ email: "", role: invite.role });
      load();
    } catch (err) {
      setMemberError(errorMessage(err));
    }
  };

  const removeMember = async (m: Member) => {
    if (!selected) return;
    setMemberError(null);
    try {
      setMembers(await api.delete<Member[]>(`/group/schools/${selected.id}/members/${m.userId}`));
      load();
    } catch (err) {
      setMemberError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Établissements du groupe"
        description="Chaque établissement garde ses élèves, ses classes et ses comptes. Vous travaillez dans un établissement à la fois : ouvrez celui que vous voulez gérer."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Nouvel établissement
          </button>
        }
      />
      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Liste indisponible">
            {error}
          </EmptyState>
        ) : !rows ? (
          <TableSkeleton columns={5} rows={3} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Établissement</th>
                <th className="num">Élèves</th>
                <th className="num">Classes</th>
                <th>État</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="cell-main">{s.name}</div>
                    <div className="cell-sub">
                      {s.code}
                      {s.city ? ` · ${s.city}` : ""}
                    </div>
                  </td>
                  <td className="num">{s.students}</td>
                  <td className="num">{s.classes}</td>
                  <td>
                    {s.current ? <span className="badge badge-info">Ouvert</span> : s.isActive ? <span className="badge badge-green">Actif</span> : <span className="badge badge-danger">Désactivé</span>}
                  </td>
                  <td className="actions">
                    {!s.current && s.isActive && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openSchool(s)} aria-label={`Ouvrir ${s.name}`}>
                        Ouvrir
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => showMembers(s)} aria-label={`Comptes de ${s.name}`}>
                      <Users size={15} /> Comptes ({s.members})
                    </button>
                    {!s.current &&
                      (s.isActive ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActive(s, false)} aria-label={`Désactiver ${s.name}`}>
                          Désactiver
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActive(s, true)} aria-label={`Réactiver ${s.name}`}>
                          Réactiver
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={saving}
        title="Nouvel établissement"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="school-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Building2 size={16} />} Créer
            </button>
          </>
        }
      >
        <form id="school-form" onSubmit={create}>
          <FormError message={formError} />
          <div className="field">
            <label htmlFor="sc-name" className="required">
              Nom de l&apos;établissement
            </label>
            <input id="sc-name" className="input" required minLength={3} maxLength={120} placeholder="Collège ABC" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sc-city">Ville</label>
              <input id="sc-city" className="input" maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sc-phone">Téléphone</label>
              <input id="sc-phone" className="input" type="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <p className="field-hint">L&apos;année scolaire en cours et ses trois trimestres sont créés avec l&apos;établissement. Ses élèves, classes et factures restent séparés des autres établissements du groupe.</p>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Comptes de ${selected.name}` : ""}>
        <FormError message={memberError} />
        <form onSubmit={addMember} className="form-grid" style={{ alignItems: "end", marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="mb-email">Rattacher un compte du groupe</label>
            <input id="mb-email" className="input" type="email" required placeholder="adresse e-mail du compte" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="mb-role">Rôle dans cet établissement</label>
            <select id="mb-role" className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field full">
            <button type="submit" className="btn btn-secondary btn-sm">
              <Plus size={15} /> Rattacher
            </button>
          </div>
        </form>
        {!members ? (
          <TableSkeleton columns={3} rows={3} />
        ) : members.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="Aucun compte rattaché">
            Créez les comptes depuis « Personnel » après avoir ouvert cet établissement, ou rattachez ci-dessus un compte existant du groupe.
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Compte</th>
                <th>Rôle</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <div className="cell-main">{m.name}</div>
                    <div className="cell-sub">{m.email}</div>
                  </td>
                  <td>{ROLE_LABELS[m.role] || m.role}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeMember(m)} aria-label={`Retirer ${m.name} de cet établissement`}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </>
  );
}

export default function SchoolsPage() {
  return (
    <Shell title="Établissements">
      <SchoolsContent />
    </Shell>
  );
}
