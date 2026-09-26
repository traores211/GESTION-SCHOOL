"use client";

import { useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>("/auth/forgot-password", { email });
      setSent(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <h1 style={{ marginBottom: 8 }}>Mot de passe oublié</h1>
        {sent ? (
          <div className="alert alert-success" role="status">
            {sent}
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="muted" style={{ marginBottom: 16 }}>
              Indiquez l&apos;adresse email de votre compte : vous recevrez un lien valable 15 minutes.
            </p>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Adresse email</label>
              <input id="email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email}>
              {loading ? "Envoi…" : "Recevoir le lien"}
            </button>
          </form>
        )}
        <p style={{ marginTop: 16 }}>
          <Link href="/login">Retour à la connexion</Link>
        </p>
      </div>
    </main>
  );
}
