"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../../lib/api";

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
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, var(--ci-green-light) 0%, #fff 60%, var(--ci-orange-light) 100%)",
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ marginBottom: 16 }}>
          <Link href={`/ecole/${params?.code}`}>← Retour à la présentation</Link>
        </p>

        <div className="card">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>📝 Demande d&apos;admission</h1>
          <p className="muted" style={{ marginBottom: 22, fontSize: 13.5 }}>
            Remplissez ce formulaire pour soumettre une candidature. Notre équipe vous contactera rapidement pour la suite du processus.
          </p>

          {success ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <h2 style={{ fontSize: 17 }}>Candidature envoyée !</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                Votre demande a bien été enregistrée. L&apos;établissement reviendra vers vous par email prochainement.
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="form-grid">
                <div className="field">
                  <label>Prénom de l&apos;enfant</label>
                  <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Nom de l&apos;enfant</label>
                  <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Date de naissance</label>
                  <input type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                </div>
                <div className="field">
                  <label>Sexe</label>
                  <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
                <div className="field">
                  <label>Email du parent/tuteur</label>
                  <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="field">
                  <label>Téléphone</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              {error && <p className="text-danger" style={{ marginBottom: 12 }}>{error}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                {submitting ? "Envoi…" : "Envoyer ma candidature"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
