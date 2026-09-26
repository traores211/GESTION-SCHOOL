"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errorMessage } from "../../lib/api";
import { setSession } from "../../lib/auth";
import { useSession } from "../../lib/session";

interface LoginResponse {
  accessToken?: string;
  mfaRequired?: boolean;
  mfaToken?: string;
  user?: { id: string; email: string; firstName: string; lastName: string; role: string };
}

// Demo accounts are shown ONLY in demo/acceptance environments, never in production.
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_ACCOUNTS = [
  { role: "Direction", email: "directeur@school.local", password: "direct123" },
  { role: "Enseignant", email: "k.kouassi@school.local", password: "teach123" },
  { role: "Comptable", email: "comptable@school.local", password: "compta123" },
  { role: "Parent", email: "parent@school.local", password: "parent123" },
  { role: "Plateforme", email: "platform@gestion.school", password: "platform123" },
];

function homeFor(role: string) {
  if (role === "PARENT") return "/portal";
  if (role === "PLATFORM_ADMIN") return "/platform";
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(params.get("expired") ? "Votre session a expiré. Reconnectez-vous." : null);
  const [loading, setLoading] = useState(false);

  const finish = (data: LoginResponse) => {
    setSession(data.accessToken!, data.user!);
    refresh();
    router.push(homeFor(data.user!.role));
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<LoginResponse>("/auth/login", { email, password });
      if (data.mfaRequired && data.mfaToken) setMfaToken(data.mfaToken);
      else finish(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      finish(await api.post<LoginResponse>("/auth/mfa/verify", { mfaToken, code }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <div style={{ marginBottom: 24 }}>
          <div className="sidebar-brand-badge" aria-hidden="true" style={{ marginBottom: 12 }}>
            G
          </div>
          <h1>Connexion</h1>
          <p className="muted">Accédez à l&apos;espace de votre établissement.</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {!mfaToken ? (
          <form onSubmit={submitPassword} noValidate>
            <div className="field">
              <label htmlFor="email">Adresse email</label>
              <input id="email" type="email" className="input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email || !password}>
              {loading ? "Connexion…" : "Se connecter"}
            </button>
            <p style={{ marginTop: 16, textAlign: "center" }}>
              <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <p style={{ marginBottom: 12 }}>Saisissez le code à 6 chiffres affiché par votre application d&apos;authentification.</p>
            <div className="field">
              <label htmlFor="code">Code de vérification</label>
              <input
                id="code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading || code.length !== 6}>
              {loading ? "Vérification…" : "Valider"}
            </button>
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setMfaToken(null)}>
              Retour
            </button>
          </form>
        )}

        {DEMO && !mfaToken && (
          <details style={{ marginTop: 20 }}>
            <summary className="muted" style={{ cursor: "pointer" }}>
              Comptes de démonstration
            </summary>
            <div className="stack" style={{ marginTop: 8 }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                >
                  {a.role} — {a.email}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
