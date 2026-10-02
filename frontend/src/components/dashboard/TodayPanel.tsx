"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, ClipboardCheck, FileUp, GraduationCap, type LucideIcon, UserPlus, Wallet, BookOpen } from "lucide-react";
import { api } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import { DAY_NAMES, Resources, Session, hasBlocking, sessionTitle, subjectColor } from "../../lib/timetable";

interface QuickAction {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  roles: string[];
}

const ADMIN = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];
const OFFICE = [...ADMIN, "SECRETARY"];

const ACTIONS: QuickAction[] = [
  { href: "/attendance", label: "Faire l'appel", hint: "Présence du jour", icon: ClipboardCheck, roles: [...OFFICE, "ENSEIGNANT"] },
  { href: "/grades", label: "Saisir des notes", hint: "Évaluations & bulletins", icon: BookOpen, roles: [...ADMIN, "ENSEIGNANT"] },
  { href: "/students", label: "Inscrire un élève", hint: "Nouveau dossier", icon: UserPlus, roles: OFFICE },
  { href: "/timetable", label: "Emplois du temps", hint: "Voir et modifier", icon: CalendarDays, roles: [...OFFICE, "ENSEIGNANT", "COMPTABLE"] },
  { href: "/timetable/import", label: "Importer un EDT", hint: "Excel, PDF, Word, photo", icon: FileUp, roles: OFFICE },
  { href: "/billing", label: "Encaisser", hint: "Factures & paiements", icon: Wallet, roles: [...OFFICE, "COMPTABLE"] },
  { href: "/admissions", label: "Admissions", hint: "Candidatures en cours", icon: GraduationCap, roles: OFFICE },
];

/** Top of the dashboard: frequent actions for the user's role and today's lessons / timetable conflicts. */
export default function TodayPanel() {
  const role = getStoredUser()?.role ?? "";
  const actions = ACTIONS.filter((a) => a.roles.includes(role)).slice(0, 6);
  const [today, setToday] = useState<Session[] | null>(null);
  const [conflicts, setConflicts] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const day = ((new Date().getDay() + 6) % 7) + 1;

  useEffect(() => {
    let cancelled = false;
    api
      .get<Resources>("/timetable/resources")
      .then(async (res) => {
        const own = !!res.me.teacherId && !OFFICE.includes(role);
        const query = own ? `?teacherId=${res.me.teacherId}` : "";
        const [{ sessions }, conflictData] = await Promise.all([
          api.get<{ sessions: Session[] }>(`/timetable/sessions${query}`),
          OFFICE.includes(role) ? api.get<{ errors: number }>("/timetable/conflicts") : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setMine(own);
        setToday(sessions.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime)));
        setConflicts(conflictData?.errors ?? null);
      })
      .catch(() => !cancelled && setToday([]));
    return () => {
      cancelled = true;
    };
  }, [day, role]);

  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const upcoming = today?.filter((s) => s.endTime > nowTime) ?? [];
  const shown = (today ?? []).slice(0, 6);

  return (
    <div className="dash-grid today-grid">
      <section className="span-7" aria-labelledby="today-title">
        <div className="today-head">
          <h2 id="today-title">
            {mine ? "Mes cours" : "Cours du jour"} · {DAY_NAMES[day]}
          </h2>
          <p className="tabular">
            {today ? `${today.length} séance(s)${today.length ? `, ${upcoming.length} à venir` : ""}` : "Chargement…"}
            {" · "}
            <Link href="/timetable">Emploi du temps</Link>
          </p>
        </div>
        {conflicts !== null && conflicts > 0 && (
          <Link href="/timetable" className="alert alert-danger" style={{ marginBottom: 8 }}>
            <AlertTriangle size={16} />
            <span className="alert-body">{conflicts} séance(s) en conflit dans les emplois du temps</span>
          </Link>
        )}
        <ol className="stub-list" aria-busy={!today || undefined}>
          {!today ? (
            [0, 1, 2].map((i) => (
              <li key={i} className="stub" aria-hidden="true">
                <span className="stub-no">
                  <span className="skeleton" style={{ height: 12, width: 44 }} />
                </span>
                <span className="stub-body">
                  <span className="skeleton" style={{ display: "block", height: 12, width: "70%" }} />
                </span>
                <span />
              </li>
            ))
          ) : shown.length === 0 ? (
            <li className="today-empty">Aucun cours prévu aujourd&apos;hui.</li>
          ) : (
            shown.map((s) => {
              const state = s.endTime <= nowTime ? "done" : s.startTime <= nowTime ? "live" : "next";
              return (
                <li key={s.id} className={`stub${state === "done" ? " is-done" : ""}`}>
                  <span className="stub-no">
                    {s.startTime}
                    <small>{s.endTime}</small>
                  </span>
                  <span className="stub-body">
                    <span className="stub-title">
                      <span className="stub-swatch" style={{ background: subjectColor(s.subject, s.label ?? "") }} aria-hidden="true" />
                      {sessionTitle(s)} · {s.class.name}
                    </span>
                    <span className="stub-meta">{[s.room?.name, mine ? null : s.teacher?.name].filter(Boolean).join(" · ") || "\u00a0"}</span>
                  </span>
                  <span className="stub-end">
                    {hasBlocking(s.conflicts) && <span className="badge badge-danger">Conflit</span>}
                    {state === "live" ? (
                      <span className="badge badge-orange">En cours</span>
                    ) : state === "done" ? (
                      <span className="badge badge-neutral">Terminé</span>
                    ) : (
                      <span className="badge badge-neutral">À venir</span>
                    )}
                  </span>
                </li>
              );
            })
          )}
          {today && today.length > shown.length && <li className="today-more">+ {today.length - shown.length} autre(s) séance(s) aujourd&apos;hui</li>}
        </ol>
      </section>

      <nav className="span-5" aria-labelledby="qa-title">
        <div className="today-head">
          <h2 id="qa-title">Raccourcis</h2>
          <p>Selon votre profil</p>
        </div>
        <ul className="quick-actions">
          {actions.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="quick-action">
                <a.icon size={17} aria-hidden="true" />
                <span className="quick-action-label">{a.label}</span>
                <small>{a.hint}</small>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}