"use client";

import { LEVELS, RELATIONS } from "../../lib/admissions";

export interface AdmissionFormValues {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  requestedLevel: string;
  previousSchool: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianEmail: string;
}

export const EMPTY_ADMISSION: AdmissionFormValues = {
  firstName: "",
  lastName: "",
  gender: "M",
  dateOfBirth: "",
  email: "",
  phone: "",
  address: "",
  requestedLevel: "",
  previousSchool: "",
  guardianName: "",
  guardianRelation: "",
  guardianPhone: "",
  guardianEmail: "",
};

/** Body sent to the API: empty strings become absent (or cleared on edit). */
export function admissionPayload(v: AdmissionFormValues, editing = false) {
  const out: Record<string, string | null> = {};
  for (const [k, raw] of Object.entries(v)) {
    const value = raw.trim();
    if (value) out[k] = value;
    else if (editing && k !== "firstName" && k !== "lastName") out[k] = k === "email" ? "" : null;
  }
  return out;
}

/** Fields of an application: the pupil, the requested schooling and the legal guardian. */
export default function AdmissionForm({ id, values, onChange, onSubmit }: { id: string; values: AdmissionFormValues; onChange: (v: AdmissionFormValues) => void; onSubmit: (e: React.FormEvent) => void }) {
  const set = (patch: Partial<AdmissionFormValues>) => onChange({ ...values, ...patch });
  return (
    <form id={id} onSubmit={onSubmit}>
      <fieldset className="adm-fieldset">
        <legend>L&apos;élève</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${id}-first`} className="required">
              Prénom(s)
            </label>
            <input id={`${id}-first`} className="input" required maxLength={80} value={values.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-last`} className="required">
              Nom
            </label>
            <input id={`${id}-last`} className="input" required maxLength={80} value={values.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-birth`}>Date de naissance</label>
            <input id={`${id}-birth`} type="date" className="input" value={values.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-gender`}>Sexe</label>
            <select id={`${id}-gender`} className="input" value={values.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-level`}>Niveau demandé</label>
            <select id={`${id}-level`} className="input" value={values.requestedLevel} onChange={(e) => set({ requestedLevel: e.target.value })}>
              <option value="">— Choisir —</option>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-prev`}>École d&apos;origine</label>
            <input id={`${id}-prev`} className="input" maxLength={120} value={values.previousSchool} onChange={(e) => set({ previousSchool: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-phone`}>Téléphone de l&apos;élève</label>
            <input id={`${id}-phone`} type="tel" className="input" maxLength={30} value={values.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-email`}>E-mail de contact</label>
            <input id={`${id}-email`} type="email" className="input" maxLength={120} value={values.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="field full">
            <label htmlFor={`${id}-address`}>Adresse</label>
            <input id={`${id}-address`} className="input" maxLength={200} placeholder="Commune, quartier" value={values.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
        </div>
      </fieldset>
      <fieldset className="adm-fieldset">
        <legend>Parent ou responsable légal</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${id}-gname`}>Nom complet</label>
            <input id={`${id}-gname`} className="input" maxLength={120} value={values.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-grel`}>Lien avec l&apos;élève</label>
            <select id={`${id}-grel`} className="input" value={values.guardianRelation} onChange={(e) => set({ guardianRelation: e.target.value })}>
              <option value="">—</option>
              {RELATIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-gphone`}>Téléphone</label>
            <input id={`${id}-gphone`} type="tel" className="input" maxLength={30} placeholder="07 00 00 00 00" value={values.guardianPhone} onChange={(e) => set({ guardianPhone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-gemail`}>E-mail</label>
            <input id={`${id}-gemail`} type="email" className="input" maxLength={120} value={values.guardianEmail} onChange={(e) => set({ guardianEmail: e.target.value })} />
          </div>
        </div>
        <p className="field-hint">À l&apos;inscription, le responsable est ajouté automatiquement à la fiche de l&apos;élève.</p>
      </fieldset>
    </form>
  );
}
