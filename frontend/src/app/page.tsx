"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, HeartHandshake, NotebookPen, type LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { BrandMark, ThemeToggle } from "../components/Brand";
import "./ecole/[code]/showcase.css";

const PORTALS: { icon: LucideIcon; title: string; text: string; cta: string }[] = [
  {
    icon: Building2,
    title: "Direction & administration",
    text: "Tableau de bord, élèves, admissions, facturation, paie et vitrine de l'établissement.",
    cta: "Accéder à l'espace",
  },
  {
    icon: NotebookPen,
    title: "Enseignants",
    text: "Appel en classe, saisie des notes et préparation des bulletins, depuis le téléphone.",
    cta: "Accéder à l'espace",
  },
  {
    icon: HeartHandshake,
    title: "Parents",
    text: "Absences, notes, bulletins et paiements de la scolarité de vos enfants.",
    cta: "Accéder au portail",
  },
];

const MODULES = [
  { title: "Élèves & admissions", text: "Dossiers, inscriptions et suivi des candidatures jusqu'à la confirmation." },
  { title: "Présence", text: "Appel quotidien par classe, retards et justificatifs, alertes aux parents." },
  { title: "Notes & bulletins", text: "Moyennes pondérées par coefficient, classement et bulletins PDF." },
  { title: "Facturation", text: "Échéances, paiements Mobile Money, espèces ou virement, relances." },
  { title: "Emplois du temps", text: "Éditeur visuel, détection des conflits, import Excel, PDF, Word ou photo." },
  { title: "Transport", text: "Véhicules, circuits et abonnements des élèves." },
  { title: "Paie du personnel", text: "Génération, validation et paiement des bulletins de salaire." },
  { title: "Vitrine publique", text: "Une page par établissement, avec candidature en ligne." },
];

export default function Home() {
  const [apiUp, setApiUp] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () =>
      fetch(`${api.apiUrl}/health`)
        .then((r) => setApiUp(r.ok))
        .catch(() => setApiUp(false));
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="sc">
      <header className="sc-header">
        <div className="sc-container">
          <Link href="/" className="sc-brand">
            <BrandMark size={34} />
            <span className="sc-brand-text">
              <span className="sc-brand-name">School ERP</span>
              <span className="sc-brand-sub">Gestion scolaire · Côte d&apos;Ivoire</span>
            </span>
          </Link>
          <div className="btn-row">
            <ThemeToggle />
            <Link href="/login" className="btn btn-primary btn-sm">
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="sc-hero">
          <div className="sc-container sc-hero-grid">
            <div className="sc-hero-inner">
              <h1>Toute la vie de l&apos;établissement, au même endroit.</h1>
              <p className="sc-hero-lead">
                Direction, enseignants et parents partagent les mêmes informations à jour : présence, notes, bulletins et
                scolarité.
              </p>
              <div className="sc-hero-actions">
                <Link href="/login" className="btn btn-primary sc-btn-lg">
                  Se connecter <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link href="/ecole/DEMO-001" className="btn btn-outline sc-btn-lg">
                  Voir une vitrine d&apos;école
                </Link>
              </div>
            </div>
            <aside className="sc-ticket" aria-label="Exemple de reçu (fictif)">
              <div className="sc-ticket-no">
                <span>N°</span>
                <strong>0142</strong>
              </div>
              <div className="sc-ticket-body">
                <p className="sc-ticket-title">Reçu de scolarité</p>
                <dl className="sc-ticket-figures">
                  <div>
                    <dt>Élève</dt>
                    <dd className="sc-ticket-text">Kouamé A.</dd>
                  </div>
                  <div>
                    <dt>1er trimestre</dt>
                    <dd>75 000</dd>
                  </div>
                  <div>
                    <dt>Orange Money</dt>
                    <dd className="sc-ticket-text">FCFA</dd>
                  </div>
                </dl>
                <span className="stamp stamp-olive sc-ticket-stamp">Payé</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="sc-section">
          <div className="sc-container">
            <div className="sc-section-head">
              <h2>Un espace pour chaque profil</h2>
              <p>Chacun se connecte avec son compte et ne voit que ce qui le concerne.</p>
            </div>
            <div className="sc-home-portals">
              {PORTALS.map((p) => (
                <article className="sc-portal" key={p.title}>
                  <p.icon size={22} aria-hidden="true" />
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                  <Link href="/login" className="btn btn-outline btn-sm">
                    {p.cta} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sc-section sc-section-alt">
          <div className="sc-container">
            <div className="sc-section-head">
              <h2>Les modules</h2>
            </div>
            <ul className="sc-modules">
              {MODULES.map((m) => (
                <li className="sc-module" key={m.title}>
                  <h3>{m.title}</h3>
                  <p>{m.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="sc-footer sc-footer-slim">
        <div className="sc-container">
          <div className="sc-footer-bottom">
            <span>© {new Date().getFullYear()} School ERP</span>
            <span role="status" className="sc-api">
              <span className={`sc-api-dot${apiUp === null ? "" : apiUp ? " is-up" : " is-down"}`} aria-hidden="true" />
              API : {apiUp === null ? "vérification…" : apiUp ? "en ligne" : "hors ligne"} ·{" "}
              <a href={`${api.apiUrl}/docs`} target="_blank" rel="noreferrer">
                Documentation
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
