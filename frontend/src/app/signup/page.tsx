"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, LoaderCircle } from "lucide-react";
import AuthCard from "../../components/AuthCard";
import { FormError } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { PASSWORD_HINT, passwordIssue } from "../../lib/password";

interface Created {
  schoolCode: string;
  schoolName: string;
  email: string;
  trialEndsAt: string;
  trialDays: number;
}

const EMPTY = { schoolName: "", city: "", phone: "", firstName: "", lastName: "", email: "", password: "" };

/** Self-service: a school creates its own space and starts a free trial. */
export default function SignupPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => {
    api.get<{ enabled: boolean }>("/public/signup").then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false));
  }, []);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = passwordIssue(form.password);
    if (issue) return setError(issue);
    setSaving(true);
    setError(null);
    try {
      setCreated(await api.post<Created>("/public/signup", { ...form, city: form.city || undefined, phone: form.phone || undefined, consent }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <AuthCard title="Votre espace est prêt" subtitle={created.schoolName}>
        <div className="alert alert-success" role="status">
          <CircleCheck size={16} />
          <div className="alert-body">
            Essai gratuit de {created.trialDays} jours, jusqu&apos;au {new Date(created.trialEndsAt).toLocaleDateString("fr-FR", { dateStyle: "long" })}. Code de l&apos;établissement : <strong>{created.schoolCode}</strong>.
          </div>
        </div>
        <p style={{ marginBottom: 16 }}>Pour bien démarrer : créez vos classes, puis importez vos élèves depuis « Imports Excel ».</p>
        <Link className="btn btn-primary btn-block btn-lg" href="/login">
          Se connecter avec {created.email}
        </Link>
      </AuthCard>
    );
  }

  if (enabled === false) {
    return (
      <AuthCard title="Inscription fermée" subtitle="L'ouverture d'un nouvel établissement se fait sur demande.">
        <p style={{ marginBottom: 16 }}>Contactez l&apos;éditeur de School ERP pour créer l&apos;espace de votre établissement.</p>
        <Link className="btn btn-outline btn-block" href="/login">
          Retour à la connexion
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Créer l'espace de mon établissement" subtitle="Essai gratuit de 30 jours, sans carte bancaire.">
      <form onSubmit={submit}>
        <FormError message={error} />
        <div className="field">
          <label htmlFor="su-school" className="required">
            Nom de l&apos;établissement
          </label>
          <input id="su-school" className="input" required minLength={3} maxLength={120} autoComplete="organization" value={form.schoolName} onChange={set("schoolName")} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="su-city">Ville</label>
            <input id="su-city" className="input" maxLength={80} autoComplete="address-level2" value={form.city} onChange={set("city")} />
          </div>
          <div className="field">
            <label htmlFor="su-phone">Téléphone</label>
            <input id="su-phone" type="tel" className="input" maxLength={30} autoComplete="tel" value={form.phone} onChange={set("phone")} />
          </div>
          <div className="field">
            <label htmlFor="su-first" className="required">
              Votre prénom
            </label>
            <input id="su-first" className="input" required maxLength={80} autoComplete="given-name" value={form.firstName} onChange={set("firstName")} />
          </div>
          <div className="field">
            <label htmlFor="su-last" className="required">
              Votre nom
            </label>
            <input id="su-last" className="input" required maxLength={80} autoComplete="family-name" value={form.lastName} onChange={set("lastName")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="su-email" className="required">
            Adresse e-mail
          </label>
          <input id="su-email" type="email" className="input" required autoComplete="email" value={form.email} onChange={set("email")} />
          <span className="field-hint">Elle servira d&apos;identifiant pour le compte de direction.</span>
        </div>
        <div className="field">
          <label htmlFor="su-password" className="required">
            Mot de passe
          </label>
          <input id="su-password" type="password" className="input" required autoComplete="new-password" value={form.password} onChange={set("password")} />
          <span className="field-hint">{PASSWORD_HINT}</span>
        </div>
        <label className="checkbox" style={{ display: "flex", marginBottom: 16 }}>
          <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            J&apos;accepte les conditions d&apos;utilisation et la{" "}
            <a href="/confidentialite" target="_blank" rel="noopener">
              politique de protection des données
            </a>
            .
          </span>
        </label>
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving || enabled === null}>
          {saving && <LoaderCircle size={18} className="spin" />} Créer mon espace
        </button>
        <p style={{ textAlign: "center", margin: "12px 0 0", fontSize: 13 }}>
          <Link href="/login">J&apos;ai déjà un compte</Link>
        </p>
      </form>
    </AuthCard>
  );
}
