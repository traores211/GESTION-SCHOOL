"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { api, ApiError } from "../../../../lib/api";
import { FormError } from "../../../../components/ui";
import { ThemeToggle } from "../../../../components/Brand";
import "../showcase.css";

export default function PublicAdmissionPage() {
  const params = useParams<{ code: string }>();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "M" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/public/schools/${params?.code}/admissions`, form);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="sc sc-apply">
      <div className="sc-apply-inner">
        <div className="sc-apply-top">
          <Link href={`/ecole/${params?.code}`} className="sc-apply-back">
            <ArrowLeft size={16} aria-hidden="true" /> Retour à la présentation
          </Link>
          <ThemeToggle />
        </div>

        <div className="sc-apply-sheet">
          <div className="sc-apply-stub" aria-hidden="true">
            <span>Candidature</span>
            <strong>{params?.code}</strong>
          </div>
          <div className="sc-apply-body">
            <h1>Demande d&apos;admission</h1>
            <p className="sc-apply-lead">
              Remplissez ce formulaire pour soumettre une candidature. L&apos;établissement vous contactera pour la suite du processus.
            </p>

            {success ? (
              <div className="sc-apply-done" role="status">
                <span className="stamp stamp-olive">Candidature reçue</span>
                <h2>Votre demande est enregistrée.</h2>
                <p>L&apos;établissement reviendra vers vous par email prochainement.</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="ap-first">Prénom de l&apos;enfant</label>
                    <input id="ap-first" className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="ap-last">Nom de l&apos;enfant</label>
                    <input id="ap-last" className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="ap-dob">Date de naissance</label>
                    <input id="ap-dob" type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="ap-gender">Sexe</label>
                    <select id="ap-gender" className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="ap-email">Email du parent/tuteur</label>
                    <input id="ap-email" type="email" autoComplete="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="ap-phone">Téléphone</label>
                    <input id="ap-phone" type="tel" autoComplete="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <FormError message={error} />
                <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
                  {submitting && <LoaderCircle size={18} className="spin" />}
                  {submitting ? "Envoi…" : "Envoyer ma candidature"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
