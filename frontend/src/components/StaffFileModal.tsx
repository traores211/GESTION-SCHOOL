"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { FormError, Modal, useFeedback } from "./ui";
import { api, errorMessage } from "../lib/api";

export const STAFF_CATEGORIES: Record<string, string> = {
  ENSEIGNANT: "Enseignant",
  SURVEILLANT: "Surveillant",
  EDUCATEUR: "Éducateur",
  ADMINISTRATION: "Administration",
  DIRECTION: "Direction",
  COMPTABILITE: "Comptabilité",
  SECRETARIAT: "Secrétariat",
  TECHNIQUE: "Personnel technique",
  SECURITE: "Sécurité",
  AUTRE: "Autre",
};
const CONTRACTS: Record<string, string> = { CDI: "CDI", CDD: "CDD", VACATAIRE: "Vacataire", STAGE: "Stage", AUTRE: "Autre" };

const FIELDS = [
  "position", "department", "matricule", "category", "gender", "dateOfBirth", "placeOfBirth", "nationality", "countryOfOrigin", "address",
  "hireDate", "contractType", "diploma", "qualification", "specialty", "experienceYears", "emergencyContactName", "emergencyContactPhone", "bankName", "bankAccount",
] as const;
type Field = (typeof FIELDS)[number];
type FileForm = Record<Field | "firstName" | "lastName" | "phone", string>;

interface StaffFile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  staffMember: Partial<Record<Field, string | number | null>> | null;
}

const day = (value: unknown) => (typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : "");

/** The personnel file of one staff member: identity, contract, qualifications, emergency contact, bank details. */
export default function StaffFileModal({ staffId, canEdit, onClose, onSaved }: { staffId: string | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const [form, setForm] = useState<FileForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!staffId) return;
    setForm(null);
    setError(null);
    api
      .get<StaffFile>(`/staff/${staffId}`)
      .then((s) => {
        const member = s.staffMember ?? {};
        const values = Object.fromEntries(FIELDS.map((f) => [f, f === "dateOfBirth" || f === "hireDate" ? day(member[f]) : member[f] == null ? "" : String(member[f])])) as Record<Field, string>;
        setForm({ ...values, firstName: s.firstName, lastName: s.lastName, phone: s.phone ?? "" });
      })
      .catch((err) => setError(errorMessage(err)));
  }, [staffId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !staffId) return;
    setSaving(true);
    setError(null);
    try {
      // Empty selects and dates are left out; free text may be emptied on purpose.
      const optional: Field[] = ["category", "gender", "dateOfBirth", "hireDate", "contractType", "position"];
      const body: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(form)) {
        if (key === "experienceYears") {
          if (value !== "") body[key] = Number(value);
        } else if (value !== "" || !optional.includes(key as Field)) body[key] = value;
      }
      await api.patch(`/staff/${staffId}/profile`, body);
      feedback.success("Dossier enregistré", `${form.firstName} ${form.lastName}`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const input = (key: keyof FileForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`sf-${key}`}>{label}</label>
      <input id={`sf-${key}`} className="input" disabled={!canEdit} value={form?.[key] ?? ""} onChange={(e) => form && setForm({ ...form, [key]: e.target.value })} {...props} />
    </div>
  );
  const select = (key: keyof FileForm, label: string, options: Record<string, string>) => (
    <div className="field">
      <label htmlFor={`sf-${key}`}>{label}</label>
      <select id={`sf-${key}`} className="input" disabled={!canEdit} value={form?.[key] ?? ""} onChange={(e) => form && setForm({ ...form, [key]: e.target.value })}>
        <option value="">—</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal
      open={!!staffId}
      onClose={onClose}
      busy={saving}
      title={form ? `Dossier de ${form.firstName} ${form.lastName}` : "Dossier du personnel"}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Fermer
          </button>
          {canEdit && (
            <button type="submit" form="staff-file-form" className="btn btn-primary" disabled={saving || !form}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Enregistrer
            </button>
          )}
        </>
      }
    >
      <FormError message={error} />
      {!form ? (
        !error && <div className="skeleton" style={{ height: 220 }} />
      ) : (
        <form id="staff-file-form" onSubmit={save}>
          <h3 className="form-section">Identité</h3>
          <div className="form-grid">
            {input("firstName", "Prénom", { required: true })}
            {input("lastName", "Nom", { required: true })}
            {select("gender", "Sexe", { M: "Masculin", F: "Féminin" })}
            {input("dateOfBirth", "Date de naissance", { type: "date" })}
            {input("placeOfBirth", "Lieu de naissance")}
            {input("nationality", "Nationalité")}
            {input("countryOfOrigin", "Pays d'origine")}
            {input("phone", "Téléphone", { type: "tel" })}
            <div className="field full">
              <label htmlFor="sf-address">Adresse</label>
              <input id="sf-address" className="input" disabled={!canEdit} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <h3 className="form-section">Poste et contrat</h3>
          <div className="form-grid">
            {select("category", "Catégorie", STAFF_CATEGORIES)}
            {input("position", "Fonction", { required: true })}
            {input("department", "Département")}
            {input("matricule", "Matricule")}
            {input("hireDate", "Date d'embauche", { type: "date" })}
            {select("contractType", "Type de contrat", CONTRACTS)}
          </div>
          <h3 className="form-section">Qualifications</h3>
          <div className="form-grid">
            {input("diploma", "Diplôme")}
            {input("qualification", "Qualification")}
            {input("specialty", "Spécialité")}
            {input("experienceYears", "Années d'expérience", { type: "number", min: 0, max: 60 })}
          </div>
          <h3 className="form-section">Personne à contacter en urgence</h3>
          <div className="form-grid">
            {input("emergencyContactName", "Nom")}
            {input("emergencyContactPhone", "Téléphone", { type: "tel" })}
          </div>
          <h3 className="form-section">Coordonnées bancaires</h3>
          <div className="form-grid">
            {input("bankName", "Banque")}
            {input("bankAccount", "Numéro de compte", { autoComplete: "off" })}
          </div>
          <p className="field-hint">Le numéro de compte est chiffré dans la base et visible de la direction et de la comptabilité uniquement.</p>
        </form>
      )}
    </Modal>
  );
}
