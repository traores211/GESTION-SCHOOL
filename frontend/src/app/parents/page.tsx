"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Phone, UserPlus, Users } from "lucide-react";
import Shell from "../../components/Shell";
import { Avatar, EmptyState, FormError, Modal, PageHeader, Pagination, SearchInput, SortHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { searchKey, useTable } from "../../lib/useTable";

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
}

interface ParentRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  relationship: string;
  smsOptOut?: boolean;
  students: StudentOption[];
}

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "", relationship: "Père", smsOptOut: false, studentIds: [] as string[], phone2: "", profession: "", employer: "", city: "", idType: "", idNumber: "" };
const ID_TYPES: Record<string, string> = { CNI: "Carte nationale d'identité", PASSEPORT: "Passeport", CARTE_CONSULAIRE: "Carte consulaire", PERMIS: "Permis de conduire", AUTRE: "Autre" };

export default function ParentsPage() {
  const feedback = useFeedback();
  const [parents, setParents] = useState<ParentRow[] | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [childFilter, setChildFilter] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(() => {
    api
      .get<ParentRow[]>("/parents")
      .then((list) => {
        setParents(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    load();
    api.get<StudentOption[]>("/students").then(setStudents).catch(() => {});
  }, [load]);

  const table = useTable<ParentRow, "name" | "relationship">({
    rows: parents ?? [],
    accessors: { name: (p) => `${p.lastName} ${p.firstName}`, relationship: (p) => p.relationship },
    searchText: (p) => `${p.firstName} ${p.lastName} ${p.email} ${p.phone} ${p.students.map((s) => `${s.firstName} ${s.lastName}`).join(" ")}`,
    initialSort: { key: "name", dir: "asc" },
  });

  const toggleStudent = (id: string) =>
    setForm((f) => ({ ...f, studentIds: f.studentIds.includes(id) ? f.studentIds.filter((s) => s !== id) : [...f.studentIds, id] }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      // Optional fields left empty are not sent
      const filled = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
      await api.post("/parents", { ...filled, email: form.email.trim().toLowerCase() });
      setShowForm(false);
      feedback.success("Parent enregistré", `${form.firstName} ${form.lastName}`);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  /** SMS consent of a guardian: switched from the list, effective for the next message. */
  const toggleSms = async (p: ParentRow) => {
    try {
      await api.patch(`/parents/${p.id}`, { smsOptOut: !p.smsOptOut });
      feedback.success(p.smsOptOut ? "SMS réactivés" : "SMS désactivés", `${p.firstName} ${p.lastName}`);
      load();
    } catch (err) {
      feedback.error("Modification impossible", errorMessage(err));
    }
  };

  const filteredChildren = students.filter((s) => searchKey(`${s.firstName} ${s.lastName} ${s.matricule}`).includes(searchKey(childFilter)));

  return (
    <Shell title="Parents">
      <PageHeader
        title="Parents & tuteurs"
        description={parents ? `${parents.length} contact(s) parental(aux)` : "Chargement…"}
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <UserPlus size={16} /> Nouveau parent
          </button>
        }
      />

      <div className="table-toolbar">
        <SearchInput value={table.query} onChange={table.setQuery} placeholder="Nom, téléphone, email, enfant…" label="Rechercher un parent" />
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Impossible de charger les parents" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        ) : !parents ? (
          <TableSkeleton columns={6} />
        ) : table.total === 0 ? (
          <EmptyState icon={<Users size={22} />} title={table.query ? "Aucun résultat" : "Aucun parent enregistré"} />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Parent" column="name" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Lien" column="relationship" sort={table.sort} onSort={table.toggleSort} />
                  <th>Contact</th>
                  <th>Messages</th>
                  <th>Enfants</th>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                        <span className="cell-main">
                          {p.lastName} {p.firstName}
                        </span>
                      </div>
                    </td>
                    <td>{p.relationship}</td>
                    <td>
                      <a href={`tel:${p.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Phone size={13} /> {p.phone}
                      </a>
                      <div className="cell-sub">{p.email}</div>
                    </td>
                    <td>
                      <button type="button" className={`badge ${p.smsOptOut ? "badge-neutral" : "badge-green"}`} style={{ cursor: "pointer", border: 0 }} aria-pressed={!p.smsOptOut} title="Cliquer pour changer" onClick={() => toggleSms(p)}>
                        {p.smsOptOut ? "SMS refusés" : "SMS acceptés"}
                      </button>
                    </td>
                    <td>
                      {p.students.length ? (
                        p.students.map((s, i) => (
                          <span key={s.id}>
                            {i > 0 && ", "}
                            <Link href={`/students/${s.id}`}>
                              {s.firstName} {s.lastName}
                            </Link>
                          </span>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onPage={table.setPage} unit="parent" />
          </>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        busy={saving}
        title="Nouveau parent"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="parent-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <UserPlus size={16} />} Enregistrer
            </button>
          </>
        }
      >
        <form id="parent-form" onSubmit={handleCreate}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pa-first" className="required">
                Prénom
              </label>
              <input id="pa-first" className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pa-last" className="required">
                Nom
              </label>
              <input id="pa-last" className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pa-email" className="required">
                Email
              </label>
              <input id="pa-email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pa-phone" className="required">
                Téléphone
              </label>
              <input id="pa-phone" type="tel" className="input" required placeholder="+225 07 00 00 00 00" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="pa-rel">Lien de parenté</label>
              <select id="pa-rel" className="input" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                <option>Père</option>
                <option>Mère</option>
                <option>Tuteur</option>
                <option>Tutrice</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pa-phone2">Téléphone secondaire</label>
              <input id="pa-phone2" type="tel" className="input" value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pa-city">Ville</label>
              <input id="pa-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pa-job">Profession</label>
              <input id="pa-job" className="input" value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pa-employer">Employeur</label>
              <input id="pa-employer" className="input" value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pa-idtype">Pièce d&apos;identité</label>
              <select id="pa-idtype" className="input" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
                <option value="">—</option>
                {Object.entries(ID_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pa-idnum">Numéro de pièce</label>
              <input id="pa-idnum" className="input" autoComplete="off" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
            </div>
          </div>
          <label className="checkbox" style={{ display: "flex", marginBottom: 14 }}>
            <input type="checkbox" checked={!form.smsOptOut} onChange={(e) => setForm({ ...form, smsOptOut: !e.target.checked })} />
            Accepte de recevoir les SMS de l&apos;établissement (absences, paiements, convocations)
          </label>
          <div className="field">
            <span className="field-label">Enfants rattachés ({form.studentIds.length})</span>
            <input className="input input-sm" type="search" placeholder="Filtrer les élèves…" aria-label="Filtrer les élèves" value={childFilter} onChange={(e) => setChildFilter(e.target.value)} />
            <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: "4px 10px" }}>
              {filteredChildren.map((s) => (
                <label key={s.id} className="checkbox" style={{ display: "flex", padding: "5px 0" }}>
                  <input type="checkbox" checked={form.studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  {s.lastName} {s.firstName} <span className="muted">({s.matricule})</span>
                </label>
              ))}
              {filteredChildren.length === 0 && <p className="muted" style={{ padding: 8, fontSize: 13 }}>Aucun élève trouvé.</p>}
            </div>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
