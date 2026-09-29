"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { HeroCollage, PersonaCard, Photo, Reveal, type PhotoKey } from "../components/photos/SchoolPhotos";
import "./ecole/[code]/showcase.css";

const PORTALS: { photo: PhotoKey; title: string; text: string; cta: string }[] = [
  {
    photo: "salleDeClasse",
    title: "Direction & administration",
    text: "Tableau de bord, élèves, admissions, facturation, paie et vitrine de l'établissement.",
    cta: "Accéder à l'espace",
  },
  {
    photo: "enseignantTableau",
    title: "Enseignants",
    text: "Appel en classe, saisie des notes et préparation des bulletins.",
    cta: "Accéder à l'espace",
  },
  {
    photo: "camarades",
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
  { title: "Transport", text: "Véhicules, circuits et abonnements des élèves." },
  { title: "Paie du personnel", text: "Génération, validation et paiement des bulletins de salaire." },
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
            <span className="sc-brand-badge" aria-hidden="true">🎓</span>
            <span>
              <span className="sc-brand-name" style={{ display: "block" }}>School ERP</span>
              <span className="sc-brand-sub">Gestion scolaire — Côte d&apos;Ivoire</span>
            </span>
          </Link>
          <Link href="/login" className="btn btn-primary btn-sm">
            Se connecter
          </Link>
        </div>
      </header>

      <main>
        <section className="sc-hero">
          <div className="sc-container sc-hero-grid">
            <div className="sc-hero-inner">
              <div className="sc-eyebrow">Plateforme de gestion scolaire</div>
              <h1>Toute la vie de l&apos;établissement, au même endroit</h1>
              <p>
                Direction, enseignants et parents partagent les mêmes informations à jour : présence, notes, bulletins et
                scolarité.
              </p>
              <div className="sc-hero-actions">
                <Link href="/login" className="btn btn-primary sc-btn-lg">
                  Se connecter
                </Link>
                <Link href="/ecole/DEMO-001" className="btn sc-btn-ghost sc-btn-lg">
                  Voir une vitrine d&apos;école
                </Link>
              </div>
            </div>
            <div className="sc-hero-art">
              <HeroCollage caption="Des élèves souriants et une enseignante en classe" />
            </div>
          </div>
        </section>
        <div className="flag-stripe" />

        <section className="sc-section">
          <div className="sc-container">
            <div className="sc-section-head center">
              <div className="sc-kicker">Accès</div>
              <h2>Un espace pour chaque profil</h2>
              <p>Chacun se connecte avec son compte et ne voit que ce qui le concerne.</p>
            </div>
            <div className="ph-personas">
              {PORTALS.map((p, i) => (
                <PersonaCard
                  key={p.title}
                  index={i}
                  photo={p.photo}
                  title={p.title}
                  text={p.text}
                  action={
                    <Link href="/login" className="btn btn-outline btn-sm">
                      {p.cta} →
                    </Link>
                  }
                />
              ))}
            </div>
          </div>
        </section>

        <section className="sc-section sc-section-alt">
          <div className="sc-container">
            <Reveal className="sc-section-head">
              <div className="sc-kicker">Au quotidien</div>
              <h2>Pensé pour la vie de l&apos;école</h2>
              <p>Des classes pleines, des cahiers bien tenus et des familles informées à chaque étape.</p>
            </Reveal>
            <div className="ph-mosaic">
              {(["fenetre", "ecriture", "eleveSac", "enseignanteLecture", "elevesUniformes"] as PhotoKey[]).map((name, i) => (
                <Reveal key={name} delay={i * 0.08} y={20}>
                  <Photo name={name} sizes={i === 0 ? "(max-width: 960px) 100vw, 480px" : "(max-width: 960px) 50vw, 340px"} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="sc-section">
          <div className="sc-container">
            <div className="sc-section-head">
              <div className="sc-kicker">Fonctionnalités</div>
              <h2>Les modules</h2>
            </div>
            <ol className="sc-steps" style={{ listStyle: "none", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {MODULES.map((m) => (
                <li className="sc-step" key={m.title}>
                  <h3>{m.title}</h3>
                  <p>{m.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="sc-footer" style={{ paddingTop: 0 }}>
        <div className="sc-container">
          <div className="sc-footer-bottom">
            <span>© {new Date().getFullYear()} School ERP</span>
            <span role="status">
              API :{" "}
              {apiUp === null ? "vérification…" : apiUp ? "● en ligne" : "● hors ligne"} ·{" "}
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
