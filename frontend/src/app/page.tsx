"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Baby,
  Banknote,
  BookOpen,
  Building2,
  Bus,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileSignature,
  GraduationCap,
  HeartHandshake,
  Megaphone,
  NotebookPen,
  Plus,
  School,
  Smartphone,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { BrandMark, FlagBand, ThemeToggle } from "../components/Brand";
import { CountUp } from "../components/dashboard/ui";
import "./home.css";

// ---------------------------------------------------------------- content

const BEFORE = [
  { title: "Les cahiers d'appel", text: "Les absences se recopient à la main et arrivent aux parents des jours plus tard." },
  { title: "Les moyennes sur Excel", text: "Un tableur par classe, des formules cassées et des bulletins retapés chaque trimestre." },
  { title: "La file à la caisse", text: "Des reçus papier, des tranches difficiles à suivre, des impayés repérés trop tard." },
  { title: "Les emplois du temps affichés", text: "Une grille modifiée au feutre, des salles en double, des professeurs à deux endroits." },
];
const AFTER = [
  { title: "L'appel en quelques secondes", text: "Sur le téléphone, tous présents par défaut : l'absence est enregistrée tout de suite." },
  { title: "Des moyennes calculées", text: "Coefficients, rangs et bulletins PDF générés à partir des notes saisies." },
  { title: "Chaque paiement numéroté", text: "Tranches, Mobile Money ou espèces, reste dû et retards visibles au même endroit." },
  { title: "Des conflits détectés", text: "L'éditeur signale salle, professeur ou classe en double avant d'enregistrer." },
];

type RoleKey = "direction" | "enseignant" | "parent";
const ROLES: Record<RoleKey, { tone: string; icon: LucideIcon; tab: string; title: string; text: string; points: string[]; cta: string }> = {
  direction: {
    tone: "var(--tone-blue)",
    icon: Building2,
    tab: "Direction",
    title: "Piloter l'établissement avec des chiffres à jour",
    text: "Le tableau de bord rassemble les effectifs, la présence, les encaissements et les résultats, avec les élèves à suivre.",
    points: ["Tableau de bord détaillé et comparaison des écoles du groupe", "Facturation, encaissements et impayés", "Paie, personnel, emplois du temps et vitrine publique"],
    cta: "Accéder à l'espace direction",
  },
  enseignant: {
    tone: "var(--tone-green)",
    icon: NotebookPen,
    tab: "Enseignants",
    title: "Faire l'appel et noter, depuis son téléphone",
    text: "Les grands boutons de l'appel tiennent sous le pouce ; les notes alimentent directement les moyennes.",
    points: ["Appel par classe en quelques secondes", "Saisie des notes et moyennes pondérées", "Emploi du temps de la semaine"],
    cta: "Accéder à l'espace enseignant",
  },
  parent: {
    tone: "var(--tone-orange)",
    icon: HeartHandshake,
    tab: "Parents",
    title: "Suivre la scolarité de ses enfants sans se déplacer",
    text: "Absences, notes, bulletins et factures sont consultables à tout moment, sur le téléphone.",
    points: ["Absences, retards et notes", "Bulletins trimestriels", "Factures et paiements de la scolarité"],
    cta: "Accéder au portail parents",
  },
};

const LEVELS: { tone: string; icon: LucideIcon; title: string; text: string; classes: string[]; school: string }[] = [
  { tone: "t-orange", icon: Baby, title: "Primaire", text: "Du CP1 au CM2, avec les matières et coefficients du primaire.", classes: ["CP1", "CE1", "CM2"], school: "EPC-SPD" },
  { tone: "t-blue", icon: School, title: "Collège", text: "De la 6ème à la 3ème, bulletins trimestriels et préparation au BEPC.", classes: ["6ème", "4ème", "3ème"], school: "CSP-YAM" },
  { tone: "t-green", icon: GraduationCap, title: "Lycée", text: "De la 2nde à la Terminale, séries et coefficients du baccalauréat.", classes: ["2nde", "1ère", "Tle"], school: "LMP-BKE" },
  { tone: "t-ochre", icon: Wrench, title: "Technique & professionnel", text: "BT et BTS, matières techniques et ateliers.", classes: ["BT 1", "BTS 1", "BTS 2"], school: "ITN-KGO" },
];

type Domain = "Administration" | "Pédagogie" | "Finances" | "Communication";
const DOMAINS: (Domain | "Tous")[] = ["Tous", "Administration", "Pédagogie", "Finances", "Communication"];
const MODULES: { tone: string; icon: LucideIcon; title: string; text: string; domain: Domain; details: string[] }[] = [
  { tone: "t-blue", icon: GraduationCap, title: "Élèves & admissions", domain: "Administration", text: "Dossiers, matricules et candidatures suivies jusqu'à l'inscription.", details: ["Fiche élève avec parents, santé et historique", "Candidature en ligne depuis la vitrine", "Suivi des étapes : dossier, test, entretien, admission"] },
  { tone: "t-green", icon: ClipboardCheck, title: "Présence", domain: "Pédagogie", text: "Appel quotidien par classe, retards et justificatifs.", details: ["Tous présents par défaut, on ne touche que les absences", "Absences justifiées et retards distingués", "Taux d'absence par jour et par niveau"] },
  { tone: "t-orange", icon: BookOpen, title: "Notes & bulletins", domain: "Pédagogie", text: "Moyennes pondérées, rangs et bulletins PDF par trimestre.", details: ["Interrogations, devoirs et compositions", "Coefficients par matière et par classe", "Distribution des moyennes et élèves à risque"] },
  { tone: "t-blue", icon: CalendarDays, title: "Emplois du temps", domain: "Pédagogie", text: "Éditeur visuel, conflits détectés, import de vos fichiers.", details: ["Glisser-déposer, vues classe, enseignant et salle", "Import Excel, PDF, Word ou photo", "Conflits de salle, de professeur et de classe signalés"] },
  { tone: "t-ochre", icon: Wallet, title: "Facturation", domain: "Finances", text: "Tranches de scolarité, paiements et impayés.", details: ["Orange Money, MTN, Moov, Wave, espèces, virement", "Référence de transaction conservée", "Échéancier comparé aux encaissements"] },
  { tone: "t-red", icon: Banknote, title: "Paie du personnel", domain: "Finances", text: "Bulletins de salaire mensuels, validation et paiement.", details: ["Salaire de base, primes et retenues", "Bulletins en préparation, validés, payés", "Masse salariale sur douze mois"] },
  { tone: "t-green", icon: Bus, title: "Transport", domain: "Administration", text: "Véhicules, circuits et abonnements des élèves.", details: ["Chauffeurs et capacité des véhicules", "Circuits avec heure de départ", "Élèves abonnés par circuit"] },
  { tone: "t-orange", icon: Megaphone, title: "Vitrine & annonces", domain: "Communication", text: "Une page publique par école, avec ses actualités.", details: ["Présentation, niveaux, galerie, partenaires", "Actualités et témoignages publiés par l'école", "Contact téléphone, WhatsApp et e-mail"] },
];

const OPERATORS = [
  { name: "Orange Money", dot: "#f77f00" },
  { name: "MTN MoMo", dot: "#f5c400" },
  { name: "Moov Money", dot: "#2f62b5" },
  { name: "Wave", dot: "#1dc8f2" },
  { name: "Espèces", dot: "#00875a" },
  { name: "Virement", dot: "#6b645a" },
];

const FAQ = [
  { q: "Faut-il installer un logiciel ?", a: "Non. School ERP s'utilise dans le navigateur, sur ordinateur, tablette ou téléphone. Chaque personne se connecte avec le compte que lui donne son établissement." },
  { q: "Quels moyens de paiement sont pris en charge ?", a: "Le secrétariat et la comptabilité enregistrent les paiements de scolarité par Orange Money, MTN MoMo, Moov Money, Wave, espèces, virement ou chèque, avec la référence de transaction pour le Mobile Money. Chaque tranche affiche ce qui reste dû." },
  { q: "Les enseignants peuvent-ils tout faire sur téléphone ?", a: "Oui pour l'essentiel du quotidien : faire l'appel, saisir les notes et consulter l'emploi du temps. Les écrans s'adaptent au téléphone, avec des boutons assez grands pour le pouce." },
  { q: "Peut-on gérer plusieurs établissements ?", a: "Oui. Un groupe scolaire réunit plusieurs écoles ; la direction du groupe compare la présence, le recouvrement et les résultats de chacune dans son tableau de bord." },
  { q: "Les données d'une école sont-elles visibles par une autre ?", a: "Non. Chaque établissement ne voit que ses propres données, et chaque profil (direction, secrétariat, enseignant, comptable, parent) n'accède qu'à ce qui le concerne. Ces droits sont appliqués par le serveur." },
  { q: "Nous avons déjà nos emplois du temps sur Excel ou en photo.", a: "Ils s'importent : Excel, CSV, PDF, Word ou photo d'une grille. Chaque ligne reconnue est vérifiée avec vous avant l'enregistrement, et les conflits sont signalés." },
];

/** Demo schools seeded with the volume data; names and sizes are read from their public showcase. */
const DEMO_SCHOOLS = ["DEMO-001", "LMP-BKE", "CSP-YAM", "EPC-SPD", "ITN-KGO"];

interface SchoolCard {
  code: string;
  name: string;
  city: string | null;
  studentsCount: number;
  classesCount: number;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Reveals blocks as they scroll into view; without JavaScript everything is simply visible. */
function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.classList.add("js-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => document.documentElement.classList.remove("js-reveal"), []);
}

// ---------------------------------------------------------------- device previews

function LaptopPreview() {
  return (
    <div className="home-laptop" aria-hidden="true">
      <div className="home-laptop-screen mini">
        <div className="mini-side">
          <i className="is-on" />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="mini-main">
          <span className="mini-title">Bonjour, Awa</span>
          <div className="mini-kpis">
            <span className="mini-kpi k1">
              Élèves<b>442</b>
            </span>
            <span className="mini-kpi k2">
              Présence<b>92,3 %</b>
            </span>
            <span className="mini-kpi k3">
              Encaissé<b>3 M</b>
            </span>
            <span className="mini-kpi k4">
              Impayés<b>52 M</b>
            </span>
          </div>
          <div className="mini-chart">
            {[40, 72, 30, 64, 55, 80, 48, 70, 62, 88].map((h, i) => (
              <i key={i} style={{ height: `${h}%`, animationDelay: `${200 + i * 50}ms` }} />
            ))}
          </div>
          <div className="mini-rows">
            <span>
              Kouamé A. · 2nde B<b>7,1 / 20</b>
            </span>
            <span>
              Yao Ange · 1ère B<b>8,3 / 20</b>
            </span>
          </div>
        </div>
      </div>
      <div className="home-laptop-base" />
    </div>
  );
}

function TeacherPhone() {
  const pupils = [
    ["Aka Nadège", 0],
    ["Doumbia Awa", 0],
    ["Kouassi Franck", 1],
    ["Kra Odette", 0],
    ["Silué Boubacar", 0],
  ] as const;
  return (
    <div className="home-phone mini" aria-hidden="true">
      <div className="mini-phone-head">
        <small>6e A · Mathématiques</small>
        <b>Appel de 07:30</b>
      </div>
      <div className="mini-phone-body">
        {pupils.map(([name, absent]) => (
          <div key={name} className="mini-pupil">
            <strong>{name}</strong>
            <div className="mini-seg">
              <em className={absent ? undefined : "is-on"}>Présent</em>
              <em className={absent ? "is-absent" : undefined}>Absent</em>
              <em>Retard</em>
              <em>Justifiée</em>
            </div>
          </div>
        ))}
      </div>
      <div className="mini-save">Enregistrer l&apos;appel · 31/32</div>
    </div>
  );
}

function ParentPhone() {
  return (
    <div className="home-phone mini" aria-hidden="true">
      <div className="mini-phone-head">
        <small>Mes enfants</small>
        <b>Prisca Kouamé · 6e A</b>
      </div>
      <div className="mini-phone-body">
        <div className="mini-card">
          <small>Moyenne du trimestre 2</small>
          <b>14,25 / 20</b>
        </div>
        <div className="mini-card">
          <small>Absences ce mois</small>
          <b>1</b> <small>justifiée</small>
        </div>
        <div className="mini-card">
          <small>2e tranche · 140 000 FCFA</small>
          <span className="mini-paid">PAYÉ</span> <small>Wave · 12 janv.</small>
        </div>
        <div className="mini-card">
          <small>Bulletin du trimestre 2</small>
          <b>Télécharger le PDF</b>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function Home() {
  const [schools, setSchools] = useState<SchoolCard[] | null>(null);
  const [role, setRole] = useState<RoleKey>("direction");
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]>("Tous");
  const [open, setOpen] = useState<string | null>(MODULES[0].title);
  const roll = useRef(Array.from({ length: 32 }, (_, i) => i === 23));
  useReveal([schools !== null]);

  useEffect(() => {
    Promise.all(
      DEMO_SCHOOLS.map((code) =>
        api
          .get<SchoolCard>(`/public/schools/${code}/showcase`)
          .then((s) => ({ code, name: s.name, city: s.city, studentsCount: s.studentsCount, classesCount: s.classesCount }))
          .catch(() => null),
      ),
    ).then((list) => setSchools(list.filter((s): s is SchoolCard => s !== null)));
  }, []);

  const figures = useMemo(() => {
    if (!schools?.length) return null;
    return {
      schools: schools.length,
      pupils: schools.reduce((s, x) => s + x.studentsCount, 0),
      classes: schools.reduce((s, x) => s + x.classesCount, 0),
      cities: new Set(schools.map((s) => s.city).filter(Boolean)).size,
    };
  }, [schools]);

  const current = ROLES[role];
  const modules = MODULES.filter((m) => domain === "Tous" || m.domain === domain);
  const onTabKey = (e: React.KeyboardEvent) => {
    const keys = Object.keys(ROLES) as RoleKey[];
    const i = keys.indexOf(role);
    if (e.key === "ArrowRight") setRole(keys[(i + 1) % keys.length]);
    if (e.key === "ArrowLeft") setRole(keys[(i - 1 + keys.length) % keys.length]);
  };

  return (
    <div className="home">
      <FlagBand />
      <header className="home-header">
        <div className="home-container">
          <Link href="/" className="home-brand">
            <BrandMark size={32} />
            <strong>School ERP</strong>
          </Link>
          <nav className="home-nav" aria-label="Sections">
            <a href="#espaces">Espaces</a>
            <a href="#niveaux">Niveaux</a>
            <a href="#modules">Modules</a>
            <a href="#ecoles">Écoles</a>
            <a href="#questions">Questions</a>
          </nav>
          <div className="home-header-actions">
            <ThemeToggle />
            <Link href="/login" className="btn btn-primary">
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="home-hero">
          <div className="home-container">
            <div className="home-hero-copy">
              <h1>
                Toute la vie de l&apos;école, <em>au même endroit</em>.
              </h1>
              <p className="home-lead">
                Appel, notes, bulletins, scolarité payée par Mobile Money, emplois du temps : la direction, les enseignants et les
                parents travaillent sur les mêmes informations, à jour.
              </p>
              <div className="home-ctas">
                <Link href="/login" className="btn btn-primary home-btn-lg">
                  Se connecter <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a href="#ecoles" className="btn home-btn-ghost home-btn-lg">
                  Découvrir une école
                </a>
              </div>
              <div className="home-proof">
                <span>
                  <Check size={16} aria-hidden="true" /> Pensé pour la Côte d&apos;Ivoire
                </span>
                <span>
                  <Smartphone size={16} aria-hidden="true" /> Utilisable sur téléphone
                </span>
                <span>
                  <Wallet size={16} aria-hidden="true" /> FCFA et Mobile Money
                </span>
              </div>
            </div>

            <div className="home-book" aria-label="Exemples fictifs d'enregistrements">
              <div className="stub">
                <span className="stub-no">
                  N° 0142
                  <small>Reçu</small>
                </span>
                <span className="stub-body">
                  <span className="stub-title">Scolarité, 1re tranche</span>
                  <span className="stub-meta">180 000 FCFA · Wave</span>
                </span>
                <span className="stub-end">
                  <span className="stamp stamp-olive">Payé</span>
                </span>
              </div>
              <div className="stub">
                <span className="stub-no">
                  07:30
                  <small>Appel</small>
                </span>
                <span className="stub-body">
                  <span className="stub-title">6e A · Mathématiques</span>
                  <span className="home-roll" aria-label="31 présents sur 32">
                    {roll.current.map((absent, i) => (
                      <i key={i} className={absent ? "is-absent" : undefined} style={{ animationDelay: `${900 + i * 22}ms` }} />
                    ))}
                  </span>
                </span>
                <span className="stub-end">
                  <span className="badge badge-danger">1 absent</span>
                </span>
              </div>
              <div className="stub">
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
              </div>
              <div className="stub">
                <span className="stub-no">
                  T2
                  <small>Bulletin</small>
                </span>
                <span className="stub-body">
                  <span className="stub-title">Moyenne générale 14,25 / 20</span>
                  <span className="stub-meta">Tableau d&apos;honneur · 3e sur 41</span>
                </span>
                <span className="stub-end">
                  <span className="badge badge-green">+1,4 pt</span>
                </span>
              </div>
              <div className="home-float" aria-hidden="true">
                <span>Taux de présence</span>
                <strong>92,3 %</strong>
                <span className="home-bars">
                  {[62, 70, 58, 76, 81, 74, 92].map((h, i) => (
                    <i key={i} style={{ height: `${h}%`, animationDelay: `${1900 + i * 60}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Payment channels ---------- */}
        <section className="home-strip" aria-label="Moyens de paiement pris en charge">
          <div className="home-container">
            <p>Scolarité encaissée par</p>
            <div className="home-operators">
              {OPERATORS.map((o) => (
                <span key={o.name} className="home-operator">
                  <i style={{ ["--dot" as string]: o.dot }} aria-hidden="true" />
                  {o.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Before / with ---------- */}
        <section className="home-section">
          <div className="home-container">
            <div className="home-section-head center" data-reveal>
              <h2>
                Fini les cahiers, <em>place au carnet numérique</em>
              </h2>
              <p>Ce qui prend des heures chaque semaine dans une école, et ce que School ERP en fait.</p>
            </div>
            <div className="home-versus" data-reveal>
              <div className="home-versus-col is-before">
                <h3>
                  <X size={22} aria-hidden="true" /> Aujourd&apos;hui
                </h3>
                <ul>
                  {BEFORE.map((b) => (
                    <li key={b.title}>
                      <X size={18} aria-hidden="true" />
                      <div>
                        <strong>{b.title}</strong>
                        <span>{b.text}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <span className="home-versus-arrow" aria-hidden="true">
                <ArrowRight size={24} />
              </span>
              <div className="home-versus-col is-after">
                <h3>
                  <Check size={22} aria-hidden="true" /> Avec School ERP
                </h3>
                <ul>
                  {AFTER.map((a) => (
                    <li key={a.title}>
                      <Check size={18} aria-hidden="true" />
                      <div>
                        <strong>{a.title}</strong>
                        <span>{a.text}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Roles with device previews ---------- */}
        <section className="home-section home-section-alt" id="espaces">
          <div className="home-container">
            <div className="home-section-head" data-reveal>
              <h2>
                Un espace pour <em>chaque profil</em>
              </h2>
              <p>Chacun se connecte avec son compte et ne voit que ce qui le concerne.</p>
            </div>
            <div className="home-roles" style={{ ["--tone" as string]: current.tone }} data-reveal>
              <div>
                <div className="home-tabs" role="tablist" aria-label="Profils" onKeyDown={onTabKey}>
                  {(Object.keys(ROLES) as RoleKey[]).map((key) => {
                    const r = ROLES[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`tab-${key}`}
                        aria-selected={role === key}
                        aria-controls="role-panel"
                        tabIndex={role === key ? 0 : -1}
                        className="home-tab"
                        style={{ ["--tone" as string]: r.tone }}
                        onClick={() => setRole(key)}
                      >
                        <r.icon size={18} aria-hidden="true" /> {r.tab}
                      </button>
                    );
                  })}
                </div>
                <div className="home-role-panel" role="tabpanel" id="role-panel" aria-labelledby={`tab-${role}`} key={role}>
                  <h3>{current.title}</h3>
                  <p>{current.text}</p>
                  <ul>
                    {current.points.map((p) => (
                      <li key={p}>
                        <Check size={18} aria-hidden="true" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <Link href="/login" className="btn btn-primary home-btn-lg">
                    {current.cta} <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <div className="home-device-stage" key={`stage-${role}`}>
                {role === "direction" ? <LaptopPreview /> : role === "enseignant" ? <TeacherPhone /> : <ParentPhone />}
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Levels ---------- */}
        <section className="home-section" id="niveaux">
          <div className="home-container">
            <div className="home-section-head" data-reveal>
              <h2>
                Du CP1 au BTS, <em>tous les niveaux</em>
              </h2>
              <p>Chaque cycle garde ses matières, ses coefficients et son calendrier. Visitez l&apos;école de démonstration de chacun.</p>
            </div>
            <div className="home-levels" data-reveal>
              {LEVELS.map((l) => (
                <Link key={l.title} href={`/ecole/${l.school}`} className={`home-level ${l.tone}`}>
                  <span className="home-level-icon" aria-hidden="true">
                    <l.icon size={24} />
                  </span>
                  <h3>{l.title}</h3>
                  <p>{l.text}</p>
                  <span className="home-level-classes">
                    {l.classes.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </span>
                  <span className="home-level-go">
                    Voir l&apos;école <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Modules: filter and expand ---------- */}
        <section className="home-section home-section-alt" id="modules">
          <div className="home-container">
            <div className="home-section-head" data-reveal>
              <h2>
                Huit modules, <em>un seul carnet</em>
              </h2>
              <p>Chaque dossier, chaque reçu, chaque appel est numéroté et rangé à sa place, de l&apos;inscription au bulletin.</p>
            </div>
            <div className="home-filter" role="group" aria-label="Filtrer les modules par domaine">
              {DOMAINS.map((d) => (
                <button key={d} type="button" className="home-chip" aria-pressed={domain === d} onClick={() => setDomain(d)}>
                  {d}
                </button>
              ))}
            </div>
            <ul className="home-modules">
              {modules.map((m) => {
                const isOpen = open === m.title;
                const id = `mod-${m.title.replace(/[^a-z]/gi, "")}`;
                return (
                  <li key={m.title} className={`home-module ${m.tone}${isOpen ? " is-open" : ""}`}>
                    <span className="home-module-mark" aria-hidden="true">
                      <m.icon size={26} />
                    </span>
                    <div>
                      <button type="button" className="home-module-toggle" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : m.title)}>
                        <span className="home-module-body" style={{ padding: 0 }}>
                          <h3>
                            {m.title}
                            <span className="home-module-tag">{m.domain}</span>
                          </h3>
                          <p>{m.text}</p>
                        </span>
                        <ChevronDown size={20} className="chev" aria-hidden="true" />
                      </button>
                      <div className="home-module-details" id={id}>
                        <div>
                          <ul>
                            {m.details.map((d) => (
                              <li key={d}>
                                <Check size={15} aria-hidden="true" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---------- Local truths ---------- */}
        <section className="home-section">
          <div className="home-container">
            <div className="home-section-head" data-reveal>
              <h2>
                Fait pour <em>les écoles ivoiriennes</em>
              </h2>
            </div>
            <div className="home-local" data-reveal>
              <div>
                <strong>FCFA</strong>
                <h3>La scolarité telle qu&apos;elle se paie</h3>
                <p>Tranches, échéances, paiements partiels, Orange Money, MTN, Moov, Wave ou espèces : chaque reçu est numéroté.</p>
              </div>
              <div>
                <strong>3 trim.</strong>
                <h3>Le calendrier scolaire d&apos;ici</h3>
                <p>Trimestres, compositions, coefficients, moyennes et rangs : les bulletins suivent les usages des établissements.</p>
              </div>
              <div>
                <strong>1 main</strong>
                <h3>L&apos;appel depuis le téléphone</h3>
                <p>Tous les élèves sont présents par défaut : l&apos;enseignant ne touche que les absences, avec de grands boutons.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Demo schools with live figures ---------- */}
        <section className="home-section home-section-alt" id="ecoles">
          <div className="home-container">
            <div className="home-section-head" data-reveal>
              <h2>
                Visitez <em>une école</em>
              </h2>
              <p>Chaque établissement a sa vitrine publique, avec ses actualités et la candidature en ligne.</p>
            </div>
            {figures && (
              <div className="home-figures" data-reveal style={{ marginBottom: 28 }}>
                <div>
                  <strong>
                    <CountUp text={String(figures.schools)} />
                  </strong>
                  <span className="home-figure-label">écoles de démonstration</span>
                </div>
                <div>
                  <strong>
                    <CountUp text={figures.pupils.toLocaleString("fr-FR")} />
                  </strong>
                  <span className="home-figure-label">élèves suivis</span>
                </div>
                <div>
                  <strong>
                    <CountUp text={String(figures.classes)} />
                  </strong>
                  <span className="home-figure-label">classes, du CP1 au BTS</span>
                </div>
                <div>
                  <strong>
                    <CountUp text={String(figures.cities)} />
                  </strong>
                  <span className="home-figure-label">villes de Côte d&apos;Ivoire</span>
                </div>
              </div>
            )}
            <div className="home-schools" data-reveal>
              {(schools ?? []).map((s) => (
                <Link key={s.code} href={`/ecole/${s.code}`} className="home-school">
                  <span className="home-school-badge" aria-hidden="true">
                    {initials(s.name)}
                  </span>
                  <strong>{s.name}</strong>
                  <span className="home-school-city">{s.city || "Côte d'Ivoire"}</span>
                  <em>
                    <CountUp text={s.studentsCount.toLocaleString("fr-FR")} />
                  </em>
                  <small>élèves · {s.classesCount} classes</small>
                  <span className="home-school-go">
                    Voir la vitrine <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </Link>
              ))}
              {schools === null &&
                DEMO_SCHOOLS.map((code) => <div key={code} className="skeleton" style={{ height: 210, borderRadius: 12 }} aria-hidden="true" />)}
            </div>
            {schools && schools.length > 0 && <p className="home-note">Établissements et élèves fictifs, créés pour la démonstration.</p>}
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="home-section" id="questions">
          <div className="home-container">
            <div className="home-section-head center" data-reveal>
              <h2>
                Questions <em>fréquentes</em>
              </h2>
            </div>
            <div className="home-faq" data-reveal>
              {FAQ.map((f, i) => (
                <details key={f.q} open={i === 0}>
                  <summary>
                    {f.q}
                    <Plus size={22} aria-hidden="true" />
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Close ---------- */}
        <section className="home-close">
          <div className="home-container">
            <div>
              <h2>Votre école, tenue comme un carnet bien rangé.</h2>
              <p>Connectez-vous avec le compte fourni par votre établissement.</p>
            </div>
            <Link href="/login" className="btn btn-primary home-btn-lg">
              <FileSignature size={18} aria-hidden="true" /> Se connecter
            </Link>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-container home-footer-grid">
          <div>
            <Link href="/" className="home-brand">
              <BrandMark size={28} />
              <strong>School ERP</strong>
            </Link>
            <p>Gestion scolaire pour les établissements de Côte d&apos;Ivoire : élèves, présence, notes, scolarité, emplois du temps.</p>
          </div>
          <div>
            <h4>Produit</h4>
            <ul>
              <li>
                <a href="#modules">Modules</a>
              </li>
              <li>
                <a href="#niveaux">Niveaux</a>
              </li>
              <li>
                <a href="#questions">Questions fréquentes</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Espaces</h4>
            <ul>
              <li>
                <Link href="/login">Direction & administration</Link>
              </li>
              <li>
                <Link href="/login">Enseignants</Link>
              </li>
              <li>
                <Link href="/login">Parents</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Ressources</h4>
            <ul>
              <li>
                <a href="#ecoles">Écoles de démonstration</a>
              </li>
              <li>
                <a href={`${api.apiUrl}/docs`} target="_blank" rel="noreferrer">
                  Documentation de l&apos;API
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="home-footer-bottom">
          <div className="home-container" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, paddingTop: 20, paddingBottom: 20, fontSize: 13, color: "var(--ink-3)" }}>
            <span>© {new Date().getFullYear()} School ERP</span>
            <span>Gestion scolaire · Côte d&apos;Ivoire</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
