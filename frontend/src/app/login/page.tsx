"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LogIn, ShieldCheck } from "lucide-react";
import { BrandMark, FlagBand, ThemeToggle } from "../../components/Brand";
import { api, ApiError, errorMessage } from "../../lib/api";
import { AuthUser, setSession } from "../../lib/auth";
import { FormError } from "../../components/ui";
import { LANGUAGES, setLang, useI18n } from "../../lib/i18n";
import "./login.css";

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

const DEMO_ACCOUNTS = [
  { role: "Direction", email: "admin@school.local", password: "admin123" },
  { role: "Enseignant", email: "k.kouassi@school.local", password: "teach123" },
  { role: "Secrétariat", email: "secretaire@school.local", password: "secret123" },
  { role: "Parent", email: "parent@school.local", password: "parent123" },
];

/** Demo accounts are listed only on demo installs (never in production). */
const SHOW_DEMO = process.env.NEXT_PUBLIC_DEMO_ACCOUNTS === "true";

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(SHOW_DEMO ? "admin@school.local" : "");
  const [password, setPassword] = useState(SHOW_DEMO ? "admin123" : "");
  const [totp, setTotp] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const expired = params.get("expired") === "1";
  const reset = params.get("reset") === "1";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<LoginResponse>("/auth/login", { email, password, ...(needsCode ? { totp } : {}) });
      setSession(data.accessToken, data.user);
      const next = params.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : null;
      router.push(data.user.role === "PARENT" ? "/portal" : safeNext || "/dashboard");
    } catch (err) {
      if (err instanceof ApiError && (err.body as { code?: string } | undefined)?.code === "TOTP_REQUIRED") {
        if (needsCode) setError(errorMessage(err));
        setNeedsCode(true);
        setTotp("");
      } else {
        setError(errorMessage(err));
      }
      setLoading(false);
    }
  };

  if (needsCode) {
    return (
      <form onSubmit={handleSubmit} className="login-form">
        <div className="alert alert-info">
          <ShieldCheck size={16} /> Double authentification : saisissez le code à 6 chiffres affiché par votre application d&apos;authentification.
        </div>
        <FormError message={error} />
        <div className="field">
          <label htmlFor="totp">{t("Code de vérification")}</label>
          <input
            id="totp"
            className="input tabular"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{3}\s?\d{3}"
            maxLength={7}
            autoFocus
            required
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            style={{ letterSpacing: "0.3em", fontSize: 20, textAlign: "center" }}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? <LoaderCircle size={18} className="spin" /> : <LogIn size={18} />} Valider
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            setNeedsCode(false);
            setError(null);
          }}
        >
          Retour
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      {expired && !error && (
        <div className="alert alert-info">
          Votre session a expiré. Reconnectez-vous pour continuer.
        </div>
      )}
      {reset && !error && <div className="alert alert-success">Mot de passe modifié : connectez-vous avec le nouveau.</div>}
      <FormError message={error} />
      <div className="field">
        <label htmlFor="email">{t("Adresse email")}</label>
        <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="password">{t("Mot de passe")}</label>
        <div className="input-icon">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="input no-lead"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="input-clear" onClick={() => setShowPassword((v) => !v)} aria-label={t(showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe")}>
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
        {loading ? <LoaderCircle size={18} className="spin" /> : <LogIn size={18} />}
        {t(loading ? "Connexion…" : "Se connecter")}
      </button>
      <p style={{ textAlign: "center", margin: "4px 0 0", fontSize: 13 }}>
        <Link href="/forgot-password">{t("Mot de passe oublié ?")}</Link>
      </p>
      <p style={{ textAlign: "center", margin: 0, fontSize: 12 }}>
        <Link href="/confidentialite" className="muted">
          {t("Protection des données personnelles")}
        </Link>
      </p>

      {SHOW_DEMO && (
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
      )}
    </form>
  );
}

export default function LoginPage() {
  const { t, lang } = useI18n();
  return (
    <main className="login">
      <FlagBand />
      <section className="login-aside" aria-hidden="true">
        <div className="login-brand">
          <BrandMark size={30} />
          <strong>School ERP</strong>
        </div>
        <div className="login-aside-inner">
          <h2>
            Chaque reçu, chaque appel, chaque dossier <em>à sa place</em>.
          </h2>
          <ol className="login-stubs">
            <li className="stub">
              <span className="stub-no">
                N° 0142
                <small>Reçu</small>
              </span>
              <span className="stub-body">
                <span className="stub-title">Scolarité, 1er trimestre</span>
                <span className="stub-meta tabular">75 000 FCFA · Orange Money</span>
              </span>
              <span className="stub-end">
                <span className="stamp stamp-olive">Payé</span>
              </span>
            </li>
            <li className="stub">
              <span className="stub-no">
                08:00
                <small>Appel</small>
              </span>
              <span className="stub-body">
                <span className="stub-title">6e A · Mathématiques</span>
                <span className="stub-meta tabular">31 présents sur 32</span>
              </span>
              <span className="stub-end">
                <span className="badge badge-danger">1 absent</span>
              </span>
            </li>
            <li className="stub">
              <span className="stub-no">
                N° 0057
                <small>Dossier</small>
              </span>
              <span className="stub-body">
                <span className="stub-title">Admission en 2nde C</span>
                <span className="stub-meta">Pièces complètes</span>
              </span>
              <span className="stub-end">
                <span className="stamp">Validé</span>
              </span>
            </li>
          </ol>
          <p className="login-caption">Exemples fictifs.</p>
        </div>
        <p className="login-foot">Élèves, présence, notes, facturation, transport et paie, au même endroit.</p>
      </section>
      <section className="login-panel">
        <div className="login-panel-tools">
          {LANGUAGES.filter((l) => l.code !== lang).map((l) => (
            <button key={l.code} type="button" className="btn btn-ghost btn-sm" lang={l.code} onClick={() => setLang(l.code)}>
              {l.label}
            </button>
          ))}
          <ThemeToggle />
        </div>
        <div className="login-card">
          <div className="login-head">
            <div className="login-brand">
              <BrandMark size={28} />
              <strong>School ERP</strong>
            </div>
            <h1>{t("Connexion")}</h1>
            <p>{t("Gestion scolaire de votre établissement")}</p>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}