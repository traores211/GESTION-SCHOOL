"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import Shell from "../../components/Shell";
import { FormError, PageHeader, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { clearSession, getStoredUser, getToken, setSession } from "../../lib/auth";
import { PASSWORD_HINT, passwordIssue } from "../../lib/password";

interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  totpEnabled: boolean;
  totpRecommended: boolean;
  sessions: { id: string; createdAt: string; userAgent: string | null; ip: string | null; expiresAt: string }[];
}

function device(ua: string | null) {
  if (!ua) return "Appareil inconnu";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone / iPad" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Autre";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  return `${browser} · ${os}`;
}

function AccountContent() {
  const router = useRouter();
  const feedback = useFeedback();
  const [me, setMe] = useState<Me | null>(null);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [disable, setDisable] = useState({ password: "", code: "" });
  const [totpError, setTotpError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Me>("/auth/me").then((m) => {
      setMe(m);
      // Keep the stored profile (banner, menu badge) in sync with the server.
      const stored = getStoredUser();
      const token = getToken();
      if (stored && token) setSession(token, { ...stored, totpEnabled: m.totpEnabled, totpRecommended: m.totpRecommended });
    });
  }, []);
  useEffect(load, [load]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = passwordIssue(pwd.next) ?? (pwd.next !== pwd.confirm ? "Les deux mots de passe ne correspondent pas" : null);
    if (issue) return setPwdError(issue);
    setBusy("pwd");
    setPwdError(null);
    try {
      await api.post("/auth/change-password", { currentPassword: pwd.current, newPassword: pwd.next });
      clearSession();
      router.push("/login?reset=1");
    } catch (err) {
      setPwdError(errorMessage(err));
      setBusy(null);
    }
  };

  const startSetup = async () => {
    setBusy("setup");
    setTotpError(null);
    try {
      setSetup(await api.post<{ qr: string; secret: string }>("/auth/2fa/setup"));
    } catch (err) {
      setTotpError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("enable");
    setTotpError(null);
    try {
      await api.post("/auth/2fa/enable", { code });
      setSetup(null);
      setCode("");
      feedback.success("Double authentification activée", "Un code vous sera demandé à chaque connexion.");
      load();
    } catch (err) {
      setTotpError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("disable");
    setTotpError(null);
    try {
      await api.post("/auth/2fa/disable", disable);
      setDisable({ password: "", code: "" });
      feedback.success("Double authentification désactivée");
      load();
    } catch (err) {
      setTotpError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const logoutAll = async () => {
    const ok = await feedback.confirm({
      title: "Déconnecter tous les appareils ?",
      message: "Toutes les sessions, y compris celle-ci, seront fermées. Utile en cas de téléphone perdu ou d'ordinateur partagé.",
      confirmLabel: "Tout déconnecter",
    });
    if (!ok) return;
    await api.post("/auth/logout-all");
    clearSession();
    router.push("/login");
  };

  return (
    <>
      <PageHeader title="Sécurité du compte" description={me ? `${me.firstName} ${me.lastName} · ${me.email}` : "Chargement…"} />
      <div className="account-grid">
        <section className="card" aria-labelledby="pwd-title">
          <h2 id="pwd-title" className="card-title">
            <KeyRound size={17} /> Mot de passe
          </h2>
          <form onSubmit={changePassword}>
            <FormError message={pwdError} />
            <div className="field">
              <label htmlFor="cp-current">Mot de passe actuel</label>
              <input id="cp-current" type="password" autoComplete="current-password" className="input" required value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="cp-new">Nouveau mot de passe</label>
              <input id="cp-new" type="password" autoComplete="new-password" className="input" required value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
              <span className="field-hint">{PASSWORD_HINT}</span>
            </div>
            <div className="field">
              <label htmlFor="cp-confirm">Confirmer</label>
              <input id="cp-confirm" type="password" autoComplete="new-password" className="input" required value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === "pwd" ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />} Changer le mot de passe
            </button>
            <p className="field-hint" style={{ marginTop: 8 }}>
              Vous serez reconnecté(e) avec le nouveau mot de passe ; les autres appareils seront déconnectés.
            </p>
          </form>
        </section>

        <section className="card" aria-labelledby="totp-title">
          <h2 id="totp-title" className="card-title">
            <Smartphone size={17} /> Double authentification
          </h2>
          <FormError message={totpError} />
          {!me ? null : me.totpEnabled ? (
            <>
              <p className="conflict-ok">
                <ShieldCheck size={16} /> Active : un code de votre application est demandé à chaque connexion.
              </p>
              <form onSubmit={turnOff} style={{ marginTop: 12 }}>
                <p className="muted" style={{ fontSize: 13 }}>
                  Pour la désactiver, confirmez avec votre mot de passe et un code.
                </p>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="d-pwd">Mot de passe</label>
                    <input id="d-pwd" type="password" className="input" required value={disable.password} onChange={(e) => setDisable({ ...disable, password: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="d-code">Code</label>
                    <input id="d-code" className="input tabular" inputMode="numeric" maxLength={7} required value={disable.code} onChange={(e) => setDisable({ ...disable, code: e.target.value })} />
                  </div>
                </div>
                <button type="submit" className="btn btn-danger-ghost" disabled={busy !== null}>
                  {busy === "disable" ? <LoaderCircle size={16} className="spin" /> : <ShieldOff size={16} />} Désactiver
                </button>
              </form>
            </>
          ) : setup ? (
            <form onSubmit={enable}>
              <ol className="muted" style={{ fontSize: 13, paddingLeft: 18, display: "grid", gap: 4 }}>
                <li>Installez Google Authenticator, Microsoft Authenticator ou une application équivalente.</li>
                <li>Scannez ce QR code (ou saisissez la clé).</li>
                <li>Saisissez le code à 6 chiffres affiché.</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code à scanner avec l'application d'authentification" width={180} height={180} style={{ display: "block", margin: "8px 0", borderRadius: 8, background: "#fff", padding: 6 }} />
              <p className="tabular" style={{ fontSize: 12, wordBreak: "break-all" }}>
                Clé : <code>{setup.secret}</code>
              </p>
              <div className="field">
                <label htmlFor="e-code">Code à 6 chiffres</label>
                <input id="e-code" className="input tabular" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                {busy === "enable" ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />} Activer
              </button>
            </form>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                Un code temporaire, généré par votre téléphone, s&apos;ajoute au mot de passe : un mot de passe volé ne suffit plus pour entrer.
                {me.totpRecommended && <strong style={{ color: "var(--warning)" }}> Recommandé pour votre rôle.</strong>}
              </p>
              <button type="button" className="btn btn-primary" onClick={startSetup} disabled={busy !== null}>
                {busy === "setup" ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />} Configurer
              </button>
            </>
          )}
        </section>

        <section className="card account-sessions" aria-labelledby="sess-title">
          <h2 id="sess-title" className="card-title">
            <Monitor size={17} /> Appareils connectés
          </h2>
          {!me ? null : me.sessions.length === 0 ? (
            <p className="muted">Aucune session active.</p>
          ) : (
            <ul className="session-list">
              {me.sessions.map((s) => (
                <li key={s.id}>
                  <strong>{device(s.userAgent)}</strong>
                  <span className="muted">
                    Connecté le {new Date(s.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                    {s.ip ? ` · ${s.ip.replace("::ffff:", "")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-danger-ghost" onClick={logoutAll}>
            <LogOut size={16} /> Déconnecter tous les appareils
          </button>
        </section>
      </div>
    </>
  );
}

export default function AccountPage() {
  return (
    <Shell title="Sécurité du compte">
      <AccountContent />
    </Shell>
  );
}
