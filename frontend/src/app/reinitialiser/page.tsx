"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, errorMessage } from "../../lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <h1 style={{ marginBottom: 16 }}>Nouveau mot de passe</h1>
        {done ? (
          <>
            <div className="alert alert-success" role="status">
              Votre mot de passe a été modifié.
            </div>
            <Link className="btn btn-primary btn-block" href="/login">
              Se connecter
            </Link>
          </>
        ) : !token ? (
          <div className="alert alert-error" role="alert">
            Lien incomplet. Refaites une demande depuis « Mot de passe oublié ».
          </div>
        ) : (
          <form onSubmit={submit}>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="pwd">Nouveau mot de passe</label>
              <input id="pwd" type="password" className="input" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pwd-hint" required />
              <span id="pwd-hint" className="field-hint">
                10 caractères minimum. Une phrase de passe est plus sûre et plus facile à retenir.
              </span>
            </div>
            <div className="field">
              <label htmlFor="pwd2">Confirmation</label>
              <input id="pwd2" type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} aria-describedby="pwd2-err" required />
              {mismatch && (
                <span id="pwd2-err" className="field-error">
                  Les deux mots de passe sont différents.
                </span>
              )}
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading || password.length < 10 || mismatch}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
