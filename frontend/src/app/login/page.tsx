"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Eye, EyeOff, GraduationCap, LoaderCircle, LogIn, ShieldCheck, Users } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { setSession } from "../../lib/auth";
import { FormError } from "../../components/ui";
import "./login.css";

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
}

const DEMO_ACCOUNTS = [
  { role: "Direction", email: "admin@school.local", password: "admin123" },
  { role: "Enseignant", email: "k.kouassi@school.local", password: "teach123" },
  { role: "Secrétariat", email: "secretaire@school.local", password: "secret123" },
  { role: "Parent", email: "parent@school.local", password: "parent123" },
];

const HIGHLIGHTS = [
  { icon: CalendarDays, text: "Emplois du temps visuels, import de vos fichiers existants" },
  { icon: Users, text: "Élèves, présence, notes et bulletins au même endroit" },
  { icon: ShieldCheck, text: "Chaque profil ne voit que ce qui le concerne" },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("admin@school.local");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const expired = params.get("expired") === "1";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<LoginResponse>("/auth/login", { email, password });
      setSession(data.accessToken, data.user);
      const next = params.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : null;
      router.push(data.user.role === "PARENT" ? "/portal" : safeNext || "/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
      {expired && !error && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          Votre session a expiré. Reconnectez-vous pour continuer.
        </div>
      )}
      <FormError message={error} />
      <div className="field">
        <label htmlFor="email">Adresse email</label>
        <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="password">Mot de passe</label>
        <div className="input-icon">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="input"
            style={{ paddingLeft: 12, paddingRight: 40 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="input-clear" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading} style={{ marginTop: 6 }}>
        {loading ? <LoaderCircle size={18} className="spin" /> : <LogIn size={18} />}
        {loading ? "Connexion…" : "Se connecter"}
      </button>

      <div className="login-demo">
        <p>Comptes de démonstration</p>
        <div className="login-demo-grid">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              className={`login-demo-btn${email === acc.email ? " is-active" : ""}`}
              onClick={() => {
                setEmail(acc.email);
                setPassword(acc.password);
                setError(null);
              }}
            >
              <strong>{acc.role}</strong>
              <span>{acc.email}</span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login">
      <section className="login-aside" aria-hidden="true">
        <div className="login-aside-inner">
          <div className="login-logo">
            <GraduationCap size={26} />
          </div>
          <h2>Toute la vie de l&apos;établissement, au même endroit.</h2>
          <ul>
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={18} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="flag-stripe" style={{ position: "absolute", bottom: 0, left: 0 }} />
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-head">
            <div className="login-logo small">
              <GraduationCap size={20} />
            </div>
            <h1>Connexion</h1>
            <p className="muted">School ERP — Gestion scolaire</p>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
