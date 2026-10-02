"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileSignature,
  FileText,
  Lock,
  Mail,
  Megaphone,
  Phone,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Showcase } from "../../lib/showcase";

/** Teaching order of the levels, so selectors read from the youngest to the oldest pupils. */
const LEVEL_ORDER = ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2", "6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale", "BT 1", "BT 2", "BTS 1", "BTS 2"];
export const levelRank = (level: string) => {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? 99 : i;
};

const fcfa = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} FCFA`;
const day = (v: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) => new Date(v).toLocaleDateString("fr-FR", opts);

// ---------------------------------------------------------------- quick access (secondary menu)

export function QuickAccess({ inscriptionHref, hasFees, hasCalendar }: { inscriptionHref: string; hasFees: boolean; hasCalendar: boolean }) {
  const items: { href: string; icon: LucideIcon; label: string; text: string; tone: string; internal?: boolean }[] = [
    { href: inscriptionHref, icon: FileSignature, label: "Inscription en ligne", text: "Candidater sans se déplacer", tone: "var(--tone-orange)", internal: true },
    ...(hasFees ? [{ href: "#frais", icon: Wallet, label: "Frais de scolarité", text: "Montants et échéances", tone: "var(--tone-green)" }] : []),
    ...(hasCalendar ? [{ href: "#calendrier", icon: CalendarDays, label: "Calendrier", text: "Trimestres et vacances", tone: "var(--tone-blue)" }] : []),
    { href: "/login", icon: Lock, label: "Espace parents", text: "Notes, absences, factures", tone: "var(--tone-ochre)", internal: true },
    { href: "#actualites", icon: Megaphone, label: "Actualités", text: "La vie de l'établissement", tone: "var(--tone-red)" },
    { href: "#contact", icon: Phone, label: "Nous contacter", text: "Secrétariat et WhatsApp", tone: "var(--tone-green)" },
  ];
  return (
    <nav className="sc-quick" aria-label="Accès rapides">
      <div className="sc-container">
        <ul>
          {items.map((it) => {
            const body = (
              <>
                <span className="sc-quick-icon" aria-hidden="true">
                  <it.icon size={20} />
                </span>
                <span>
                  <strong>{it.label}</strong>
                  <small>{it.text}</small>
                </span>
              </>
            );
            return (
              <li key={it.label} style={{ ["--tone" as string]: it.tone }}>
                {it.internal ? (
                  <Link href={it.href} className="sc-quick-item">
                    {body}
                  </Link>
                ) : (
                  <a href={it.href} className="sc-quick-item">
                    {body}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- programmes

export function ProgramsSection({ programs, cycles }: { programs: Showcase["programs"]; cycles: { name: string; description: string; levels: string[] }[] }) {
  const sorted = useMemo(() => [...programs].sort((a, b) => levelRank(a.level) - levelRank(b.level)), [programs]);
  const [level, setLevel] = useState(sorted[0]?.level ?? "");
  const current = sorted.find((p) => p.level === level) ?? sorted[0];
  if (!current) return null;
  const maxCoeff = Math.max(...current.subjects.map((s) => s.coefficient), 1);
  const totalCoeff = current.subjects.reduce((s, x) => s + x.coefficient, 0);

  return (
    <div className="sc-programs">
      <div className="sc-programs-cycles">
        {cycles.map((cycle) => (
          <div key={cycle.name} className="sc-programs-cycle">
            <h3>{cycle.name}</h3>
            {cycle.description && <p>{cycle.description}</p>}
            <div className="sc-level-chips" role="group" aria-label={`Niveaux du cycle ${cycle.name}`}>
              {cycle.levels
                .filter((l) => sorted.some((p) => p.level === l))
                .sort((a, b) => levelRank(a) - levelRank(b))
                .map((l) => (
                  <button key={l} type="button" className="sc-level-chip" aria-pressed={l === current.level} onClick={() => setLevel(l)}>
                    {l}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="sc-programs-panel" key={current.level}>
        <div className="sc-programs-head">
          <h3>Programme de {current.level}</h3>
          <span>
            {current.subjects.length} matières · total des coefficients {totalCoeff}
          </span>
        </div>
        <ul className="sc-subjects">
          {current.subjects.map((s, i) => (
            <li key={s.name} style={{ ["--w" as string]: `${(s.coefficient / maxCoeff) * 100}%`, ["--i" as string]: i }}>
              <span className="sc-subject-name">{s.name}</span>
              <span className="sc-subject-bar" aria-hidden="true">
                <i />
              </span>
              <span className="sc-subject-coeff">coef. {s.coefficient}</span>
            </li>
          ))}
        </ul>
        <p className="sc-note">Les coefficients pondèrent la moyenne de chaque matière dans la moyenne générale du bulletin.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- admission journey

const JOURNEY = [
  { icon: Mail, title: "Se renseigner", text: "Consultez les niveaux, les frais et le calendrier, ou contactez le secrétariat par téléphone ou WhatsApp." },
  { icon: FileSignature, title: "Candidater en ligne", text: "Remplissez le formulaire en quelques minutes, sans créer de compte. Vous recevez une confirmation à l'écran." },
  { icon: ClipboardCheck, title: "Étude du dossier", text: "L'établissement examine la candidature, organise si besoin un test ou un entretien, puis vous recontacte." },
  { icon: ShieldCheck, title: "Inscription", text: "Une fois l'élève admis, l'inscription est finalisée et l'espace parents est ouvert." },
];
const DOCUMENTS = ["Extrait d'acte de naissance", "Bulletins de l'année précédente", "Photo d'identité récente", "Certificat de scolarité ou de radiation"];

export function AdmissionJourney({ inscriptionHref, academicYear }: { inscriptionHref: string; academicYear: string | null }) {
  return (
    <div className="sc-journey">
      <ol className="sc-journey-steps">
        {JOURNEY.map((step, i) => (
          <li key={step.title}>
            <span className="sc-journey-num" aria-hidden="true">
              {i + 1}
            </span>
            <step.icon size={22} aria-hidden="true" className="sc-journey-icon" />
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <aside className="sc-journey-side">
        <h3>Candidatures {academicYear || "ouvertes"}</h3>
        <p>Le formulaire se remplit en trois étapes : l&apos;élève, le parent ou tuteur, puis la vérification.</p>
        <Link href={inscriptionHref} className="btn btn-primary sc-btn-lg">
          Commencer ma candidature <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <h4>Pièces généralement demandées</h4>
        <ul>
          {DOCUMENTS.map((d) => (
            <li key={d}>
              <FileText size={15} aria-hidden="true" />
              {d}
            </li>
          ))}
        </ul>
        <small>La liste exacte est confirmée par le secrétariat lors de l&apos;étude du dossier.</small>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- fees

const CHANNELS = [
  { name: "Orange Money", dot: "#f77f00" },
  { name: "MTN MoMo", dot: "#f5c400" },
  { name: "Moov Money", dot: "#2f62b5" },
  { name: "Wave", dot: "#1dc8f2" },
  { name: "Espèces", dot: "#00875a" },
  { name: "Virement", dot: "#6b645a" },
];

export function FeesSection({ fees, academicYear }: { fees: Showcase["fees"]; academicYear: string | null }) {
  const sorted = useMemo(() => [...fees].sort((a, b) => levelRank(a.level) - levelRank(b.level)), [fees]);
  const [level, setLevel] = useState(sorted[0]?.level ?? "");
  const current = sorted.find((f) => f.level === level) ?? sorted[0];
  if (!current) return null;
  const today = Date.now();
  // Dim paid-by-now instalments only while some are still ahead; a finished year reads as a plain schedule.
  const someAhead = current.instalments.some((i) => new Date(i.dueDate).getTime() >= today);

  return (
    <div className="sc-fees">
      <div className="sc-fees-picker" role="group" aria-label="Choisir un niveau">
        {sorted.map((f) => (
          <button key={f.level} type="button" className="sc-level-chip" aria-pressed={f.level === current.level} onClick={() => setLevel(f.level)}>
            {f.level}
          </button>
        ))}
      </div>
      <div className="sc-fees-card" key={current.level}>
        <div className="sc-fees-total">
          <span>Scolarité annuelle · {current.level}</span>
          <strong>{fcfa(current.annual)}</strong>
          <small>
            Année {academicYear || "en cours"}, payable en {current.instalments.length} tranche{current.instalments.length > 1 ? "s" : ""}
          </small>
          <div className="sc-fees-split" aria-hidden="true">
            {current.instalments.map((ins, i) => (
              <i key={ins.label} style={{ flex: ins.amount, ["--i" as string]: i }} />
            ))}
          </div>
        </div>
        <ol className="sc-fees-schedule">
          {current.instalments.map((ins, i) => {
            const past = someAhead && new Date(ins.dueDate).getTime() < today;
            return (
              <li key={ins.label} className={past ? "is-past" : undefined}>
                <span className="sc-fees-no">{i + 1}</span>
                <div>
                  <strong>{ins.label.replace(/^Scolarité [\d-]+, /, "").replace(/^./, (c) => c.toUpperCase())}</strong>
                  <span>avant le {day(ins.dueDate, { day: "numeric", month: "long", year: "numeric" })}</span>
                </div>
                <em>{fcfa(ins.amount)}</em>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="sc-fees-pay">
        <h3>Moyens de paiement</h3>
        <div className="sc-fees-channels">
          {CHANNELS.map((c) => (
            <span key={c.name}>
              <i style={{ background: c.dot }} aria-hidden="true" />
              {c.name}
            </span>
          ))}
        </div>
        <p>Chaque paiement est enregistré par l&apos;établissement avec un reçu numéroté ; le reste dû se suit dans l&apos;espace parents.</p>
        <small>Montants établis d&apos;après la facturation de l&apos;année en cours ; frais d&apos;inscription, cantine et transport en sus le cas échéant.</small>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- calendar

interface CalEvent {
  date: Date;
  end?: Date;
  title: string;
  kind: "term" | "holiday" | "fee" | "milestone";
}

export function CalendarSection({ calendar, fees }: { calendar: NonNullable<Showcase["calendar"]>; fees: Showcase["fees"] }) {
  const start = new Date(calendar.start);
  const end = new Date(calendar.end);
  const span = end.getTime() - start.getTime() || 1;
  const pos = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));
  const terms = [...calendar.terms].sort((a, b) => a.order - b.order);
  const now = new Date();
  const nowPos = now >= start && now <= end ? pos(now) : null;

  const events: CalEvent[] = [];
  events.push({ date: start, title: "Rentrée des classes", kind: "milestone" });
  terms.forEach((t, i) => {
    events.push({ date: new Date(t.startDate), end: new Date(t.endDate), title: t.name, kind: "term" });
    const next = terms[i + 1];
    if (next) {
      const from = new Date(new Date(t.endDate).getTime() + 86400000);
      const to = new Date(new Date(next.startDate).getTime() - 86400000);
      if (to > from) events.push({ date: from, end: to, title: i === 0 ? "Vacances de fin d'année" : "Vacances de Pâques", kind: "holiday" });
    }
  });
  const dues = new Map<string, Date>();
  for (const f of fees) for (const ins of f.instalments) dues.set(ins.label.replace(/^Scolarité [\d-]+, /, ""), new Date(ins.dueDate));
  for (const [label, date] of dues) events.push({ date, title: `Échéance de la ${label}`, kind: "fee" });
  events.push({ date: end, title: "Fin de l'année scolaire", kind: "milestone" });
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  const someAhead = events.some((e) => (e.end ?? e.date) >= now);

  const months: Date[] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);

  return (
    <div className="sc-cal">
      <div className="sc-cal-track" role="img" aria-label={`Calendrier de l'année du ${day(start)} au ${day(end)}`}>
        <div className="sc-cal-months">
          {months.map((m) => (
            <span key={m.toISOString()} style={{ left: `${pos(m < start ? start : m)}%` }}>
              {m.toLocaleDateString("fr-FR", { month: "short" })}
            </span>
          ))}
        </div>
        <div className="sc-cal-bar">
          {events
            .filter((e) => e.end)
            .map((e) => (
              <span
                key={e.title}
                className={`sc-cal-seg is-${e.kind}`}
                style={{ left: `${pos(e.date)}%`, width: `${pos(e.end!) - pos(e.date)}%` }}
                title={`${e.title} : du ${day(e.date)} au ${day(e.end!)}`}
              >
                <em>{e.title}</em>
              </span>
            ))}
          {events
            .filter((e) => e.kind === "fee")
            .map((e) => (
              <span key={e.title} className="sc-cal-pin" style={{ left: `${pos(e.date)}%` }} title={`${e.title} : ${day(e.date)}`} />
            ))}
          {nowPos !== null && (
            <span className="sc-cal-now" style={{ left: `${nowPos}%` }}>
              <em>Aujourd&apos;hui</em>
            </span>
          )}
        </div>
        <div className="sc-cal-legend">
          <span>
            <i className="is-term" /> Trimestres
          </span>
          <span>
            <i className="is-holiday" /> Vacances
          </span>
          <span>
            <i className="is-fee" /> Échéances de scolarité
          </span>
        </div>
      </div>
      <ol className="sc-cal-list">
        {events.map((e) => {
          const past = someAhead && (e.end ?? e.date) < now;
          return (
            <li key={`${e.title}-${e.date.toISOString()}`} className={`is-${e.kind}${past ? " is-past" : ""}`}>
              <span className="sc-cal-date">
                <strong>{e.date.getDate()}</strong>
                <small>{e.date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}</small>
              </span>
              <div>
                <strong>{e.title}</strong>
                <span>{e.end ? `du ${day(e.date)} au ${day(e.end, { day: "numeric", month: "long", year: "numeric" })}` : day(e.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- secure portal

const PORTAL_FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BookOpen, title: "Notes & bulletins", text: "Les notes au fil des évaluations et les bulletins de chaque trimestre." },
  { icon: ClipboardCheck, title: "Absences & retards", text: "Chaque absence est visible dès que l'appel est fait en classe." },
  { icon: Wallet, title: "Factures & paiements", text: "Les tranches réglées, le reste dû et les reçus." },
  { icon: CalendarDays, title: "Emploi du temps", text: "La semaine de cours de chaque enfant." },
  { icon: Megaphone, title: "Annonces", text: "Les informations publiées par l'établissement." },
];

export function PortalSection({ schoolName }: { schoolName: string }) {
  return (
    <div className="sc-portal">
      <div className="sc-portal-copy">
        <span className="sc-portal-lock" aria-hidden="true">
          <Lock size={26} />
        </span>
        <h2>L&apos;espace élèves &amp; parents</h2>
        <p>Toute la scolarité de vos enfants à {schoolName}, sur ordinateur ou sur téléphone, avec le compte remis par l&apos;établissement.</p>
        <ul className="sc-portal-trust">
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Connexion personnelle et sécurisée
          </li>
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Chaque parent ne voit que ses propres enfants
          </li>
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Données de l&apos;école séparées des autres établissements
          </li>
        </ul>
        <div className="sc-portal-ctas">
          <Link href="/login" className="btn btn-primary sc-btn-lg">
            <Lock size={18} aria-hidden="true" /> Accéder à mon espace
          </Link>
          <Link href="/login" className="btn sc-portal-ghost sc-btn-lg">
            Espace enseignants
          </Link>
        </div>
      </div>
      <ul className="sc-portal-grid">
        {PORTAL_FEATURES.map((f) => (
          <li key={f.title}>
            <f.icon size={22} aria-hidden="true" />
            <strong>{f.title}</strong>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
