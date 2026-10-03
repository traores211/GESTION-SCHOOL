"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, MailCheck, Send } from "lucide-react";
import AuthCard from "../../components/AuthCard";
import { FormError } from "../../components/ui";
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
    <AuthCard title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe.">
      {sent ? (
        <div className="login-form">
          <div className="alert alert-success" role="status">
            <MailCheck size={16} /> {sent}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Le lien est valable une heure. Pensez à vérifier les courriers indésirables.
          </p>
          <Link href="/login" className="btn btn-outline btn-block">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form className="login-form" onSubmit={submit}>
          <FormError message={error} />
          <div className="field">
            <label htmlFor="fp-email">Adresse email du compte</label>
            <input id="fp-email" type="email" autoComplete="username" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />} Envoyer le lien
          </button>
          <p style={{ textAlign: "center", margin: 0, fontSize: 13 }}>
            <Link href="/login">Retour à la connexion</Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
