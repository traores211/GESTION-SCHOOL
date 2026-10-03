"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Pencil } from "lucide-react";
import { api, ApiError } from "../../../../lib/api";
import type { Showcase } from "../../../../lib/showcase";
import { FormError } from "../../../../components/ui";
import { FlagBand, ThemeToggle } from "../../../../components/Brand";
import "../showcase.css";

const STEPS = ["L'élève", "Parent ou tuteur", "Vérification"];

type Form = { firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string; gender: string };

export default function PublicAdmissionPage() {
  const params = useParams<{ code: string }>();
  const [school, setSchool] = useState<Pick<Showcase, "name" | "academicYear" | "city"> | null>(null);
  const [form, setForm] = useState<Form>({ firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "M" });
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!params?.code) return;
    api
      .get<Showcase>(`/public/schools/${params.code}/showcase`)
      .then((s) => setSchool({ name: s.name, academicYear: s.academicYear, city: s.city }))
      .catch(() => setSchool(null));
  }, [params?.code]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, reference]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  /** Moves forward only when the fields of the current step are valid (native validation messages). */
  const next = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formRef.current?.reportValidity()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    void submit();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post<{ reference: string }>(`/public/schools/${params?.code}/admissions`, { ...form, consent });
      setReference(res.reference.startsWith("ADM-") ? res.reference : res.reference.slice(-6).toUpperCase());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    } finally {
      setSubmitting(false);
    }
  };

  const birth = form.dateOfBirth ? new Date(form.dateOfBirth).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "Non renseignée";

  return (
    <main className="sc sc-apply">
      <FlagBand />
      <div className="sc-apply-inner">
        <div className="sc-apply-top">
          <Link href={`/ecole/${params?.code}`} className="sc-apply-back">
            <ArrowLeft size={16} aria-hidden="true" /> {school?.name ? `Retour à ${school.name}` : "Retour à la présentation"}
          </Link>
          <ThemeToggle />
        </div>

        <div className="sc-apply-sheet">
          <div className="sc-apply-stub" aria-hidden="true">
            <span>Candidature</span>
            <strong>{params?.code}</strong>
          </div>
          <div className="sc-apply-body">
            {reference ? (
              <div className="sc-apply-done" role="status">
                <span className="stamp stamp-olive">Candidature reçue</span>
                <h1 ref={headingRef} tabIndex={-1}>
                  Merci, votre demande est enregistrée.
                </h1>
                <p>
                  Numéro de dossier <strong className="tabular">{reference}</strong>. L&apos;établissement étudie la candidature de {form.firstName} {form.lastName} et vous
                  recontacte à l&apos;adresse {form.email}.
                </p>
                <ol className="sc-apply-next">
                  <li>
                    <Check size={16} aria-hidden="true" /> Candidature en ligne
                  </li>
                  <li>Étude du dossier, test ou entretien si besoin</li>
                  <li>Admission et inscription</li>
                </ol>
                <p>
                  Vous pourrez suivre l&apos;avancement à tout moment avec ce numéro :{" "}
                  <Link href={`/ecole/${params?.code}/suivi?ref=${encodeURIComponent(reference)}`}>suivre ma candidature</Link>.
                </p>
                <Link href={`/ecole/${params?.code}`} className="btn btn-outline">
                  Revenir à la vitrine
                </Link>
              </div>
            ) : (
              <>
                <h1 ref={headingRef} tabIndex={-1}>
                  Demande d&apos;admission
                </h1>
                <p className="sc-apply-lead">
                  {school ? `${school.name}${school.academicYear ? `, année ${school.academicYear}` : ""}. ` : ""}
                  Trois étapes, quelques minutes, sans créer de compte.
                </p>

                <ol className="stepper" aria-label="Étapes de la candidature">
                  {STEPS.map((label, i) => (
                    <li key={label} style={{ display: "contents" }}>
                      {i > 0 && <span className="step-sep" aria-hidden="true" />}
                      <span className={`step${i === step ? " is-current" : i < step ? " is-done" : ""}`} aria-current={i === step ? "step" : undefined}>
                        <span className="step-dot">{i < step ? <Check size={14} /> : i + 1}</span>
                        <span className="step-label">{label}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <form ref={formRef} onSubmit={next} noValidate={false}>
                  {step === 0 && (
                    <div className="form-grid sc-apply-step" key="s0">
                      <div className="field">
                        <label htmlFor="ap-first" className="required">
                          Prénom de l&apos;enfant
                        </label>
                        <input id="ap-first" className="input" required autoComplete="off" value={form.firstName} onChange={set("firstName")} />
                      </div>
                      <div className="field">
                        <label htmlFor="ap-last" className="required">
                          Nom de l&apos;enfant
                        </label>
                        <input id="ap-last" className="input" required autoComplete="off" value={form.lastName} onChange={set("lastName")} />
                      </div>
                      <div className="field">
                        <label htmlFor="ap-dob">Date de naissance</label>
                        <input id="ap-dob" type="date" className="input" value={form.dateOfBirth} onChange={set("dateOfBirth")} max={new Date().toISOString().slice(0, 10)} />
                      </div>
                      <div className="field">
                        <label htmlFor="ap-gender">Sexe</label>
                        <select id="ap-gender" className="input" value={form.gender} onChange={set("gender")}>
                          <option value="M">Masculin</option>
                          <option value="F">Féminin</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="form-grid sc-apply-step" key="s1">
                      <div className="field">
                        <label htmlFor="ap-email" className="required">
                          E-mail du parent ou tuteur
                        </label>
                        <input id="ap-email" type="email" autoComplete="email" className="input" required value={form.email} onChange={set("email")} />
                        <span className="field-hint">La réponse de l&apos;établissement arrivera à cette adresse.</span>
                      </div>
                      <div className="field">
                        <label htmlFor="ap-phone">Téléphone</label>
                        <input id="ap-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+225 07 00 00 00 00" className="input" value={form.phone} onChange={set("phone")} />
                        <span className="field-hint">Numéro joignable par téléphone ou WhatsApp.</span>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="sc-apply-step" key="s2">
                      <dl className="sc-apply-review">
                        <div>
                          <dt>Élève</dt>
                          <dd>
                            {form.firstName} {form.lastName} · {form.gender === "F" ? "Féminin" : "Masculin"}
                          </dd>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(0)}>
                            <Pencil size={14} aria-hidden="true" /> Modifier
                          </button>
                        </div>
                        <div>
                          <dt>Date de naissance</dt>
                          <dd>{birth}</dd>
                          <span />
                        </div>
                        <div>
                          <dt>Contact</dt>
                          <dd>
                            {form.email}
                            {form.phone && ` · ${form.phone}`}
                          </dd>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>
                            <Pencil size={14} aria-hidden="true" /> Modifier
                          </button>
                        </div>
                      </dl>
                      <label className="checkbox sc-apply-consent">
                        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                        <span>
                          J&apos;accepte que l&apos;établissement utilise ces informations pour étudier la candidature et me recontacter.{" "}
                          <a href="/confidentialite" target="_blank" rel="noopener">
                            En savoir plus sur vos données
                          </a>
                        </span>
                      </label>
                    </div>
                  )}

                  <FormError message={error} />
                  <div className="sc-apply-actions">
                    {step > 0 && (
                      <button type="button" className="btn btn-outline btn-lg" onClick={() => setStep(step - 1)} disabled={submitting}>
                        <ArrowLeft size={18} aria-hidden="true" /> Précédent
                      </button>
                    )}
                    <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                      {submitting && <LoaderCircle size={18} className="spin" />}
                      {step < STEPS.length - 1 ? (
                        <>
                          Continuer <ArrowRight size={18} aria-hidden="true" />
                        </>
                      ) : submitting ? (
                        "Envoi…"
                      ) : (
                        "Envoyer ma candidature"
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
