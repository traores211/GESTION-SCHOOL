"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import AuthCard from "../../components/AuthCard";
import { FormError } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { PASSWORD_HINT, passwordIssue } from "../../lib/password";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="login-form">
        <div className="alert alert-danger">Lien incomplet. Refaites une demande de réinitialisation.</div>
        <Link href="/forgot-password" className="btn btn-primary btn-block">
          Nouvelle demande
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = passwordIssue(password) ?? (password !== confirm ? "Les deux mots de passe ne correspondent pas" : null);
    if (issue) return setError(issue);
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      router.push("/login?reset=1");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <form className="login-form" onSubmit={submit}>
      <FormError message={error} />
      <div className="field">
        <label htmlFor="rp-new">Nouveau mot de passe</label>
        <input id="rp-new" type="password" autoComplete="new-password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="field-hint">{PASSWORD_HINT}</span>
      </div>
      <div className="field">
        <label htmlFor="rp-confirm">Confirmer</label>
        <input id="rp-confirm" type="password" autoComplete="new-password" className="input" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
        {loading ? <LoaderCircle size={18} className="spin" /> : <KeyRound size={18} />} Enregistrer le mot de passe
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Toutes vos sessions ouvertes seront déconnectées.">
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
