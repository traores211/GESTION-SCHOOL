"use client";

import { useState } from "react";
import Shell from "../../components/Shell";
import { api, errorMessage } from "../../lib/api";
import { ROLE_LABELS } from "../../lib/auth";
import { useSession } from "../../lib/session";
import { useToast } from "../../components/ui/States";

export default function ProfilePage() {
  const { me, refresh } = useSession();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      setSetup(await api.post("/auth/mfa/setup"));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/auth/mfa/enable", { code });
      setSetup(null);
      toast("Double authentification activée");
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Shell title="Mon profil">
      <div className="page-header">
        <div>
          <h1>Mon profil</h1>
          <p>
            {me?.firstName} {me?.lastName} · {me ? ROLE_LABELS[me.role] ?? me.role : ""} · {me?.email}
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="mfa-title" style={{ maxWidth: 640 }}>
        <h2 id="mfa-title" className="card-title">
          Double authentification
        </h2>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {me?.mfaEnabled ? (
          <p className="badge badge-green">Active — un code vous est demandé à chaque connexion.</p>
        ) : setup ? (
          <form onSubmit={enable} className="stack">
            <p>
              1. Dans votre application d&apos;authentification (Google Authenticator, Microsoft Authenticator…), ajoutez un compte avec cette clé :
            </p>
            <code style={{ fontSize: 16, letterSpacing: 2, padding: 12, background: "var(--surface-2)", borderRadius: 8, wordBreak: "break-all" }}>{setup.secret}</code>
            <p className="muted" style={{ fontSize: 13 }}>
              Sur mobile, vous pouvez aussi <a href={setup.otpauthUrl}>ouvrir directement l&apos;application</a>.
            </p>
            <div className="field" style={{ maxWidth: 220 }}>
              <label htmlFor="mfa-code">2. Code affiché</label>
              <input id="mfa-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={code.length !== 6}>
                Activer
              </button>
            </div>
          </form>
        ) : (
          <>
            <p style={{ marginBottom: 12 }}>
              Recommandée pour la direction et la comptabilité : même si votre mot de passe est dérobé, personne ne pourra se connecter sans votre téléphone.
            </p>
            <button type="button" className="btn btn-primary" onClick={start}>
              Configurer
            </button>
          </>
        )}
      </section>
    </Shell>
  );
}
