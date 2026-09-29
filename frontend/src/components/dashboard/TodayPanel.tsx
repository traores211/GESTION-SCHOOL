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

  return (
    <div className="dash-grid" style={{ marginBottom: 24 }}>
      <section className="span-7" aria-labelledby="qa-title">
        <h2 id="qa-title" className="visually-hidden">
          Actions rapides
        </h2>
        <div className="quick-actions stagger" style={{ marginBottom: 0 }}>
          {actions.map((a, i) => (
            <Link key={a.href} href={a.href} className="quick-action" style={{ ["--i" as string]: i }}>
              <span className="quick-action-icon">
                <a.icon size={18} />
              </span>
              <span>
                {a.label}
                <small>{a.hint}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card span-5" aria-labelledby="today-title" style={{ padding: 16 }}>
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div>
            <h2 id="today-title" className="card-title">
              <CalendarDays size={17} /> {mine ? "Mes cours" : "Cours"} — {DAY_NAMES[day]}
            </h2>
            <p className="card-sub">{today ? `${today.length} séance(s) aujourd'hui${upcoming.length !== today.length ? `, ${upcoming.length} à venir` : ""}` : "Chargement…"}</p>
          </div>
          <Link href="/timetable" className="btn btn-ghost btn-sm">
            Tout voir
          </Link>
        </div>
        {conflicts !== null && conflicts > 0 && (
          <Link href="/timetable" className="alert alert-danger" style={{ marginBottom: 8, padding: "8px 12px", textDecoration: "none" }}>
            <AlertTriangle size={16} />
            <span className="alert-body">{conflicts} séance(s) en conflit dans les emplois du temps</span>
          </Link>
        )}
        {!today ? (
          <div className="stack" style={{ gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 30 }} />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, padding: "10px 0" }}>
            {today.length ? "Les cours de la journée sont terminés." : "Aucun cours prévu aujourd'hui."}
          </p>
        ) : (
          <div className="activity">
            {upcoming.slice(0, 5).map((s) => (
              <div key={s.id} className="activity-item">
                <span className="activity-time">
                  {s.startTime}–{s.endTime}
                </span>
                <span className="activity-dot" style={{ background: subjectColor(s.subject, s.label ?? "") }} aria-hidden="true" />
                <span style={{ minWidth: 0, fontSize: 13 }}>
                  <strong>{sessionTitle(s)}</strong> · {s.class.name}
                  <span className="muted">{[s.room?.name, mine ? null : s.teacher?.name].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                  {hasBlocking(s.conflicts) && (
                    <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                      conflit
                    </span>
                  )}
                </span>
              </div>
            ))}
            {upcoming.length > 5 && <p className="muted" style={{ fontSize: 12.5, paddingTop: 6 }}>+ {upcoming.length - 5} autre(s)</p>}
          </div>
        )}
      </section>
    </div>
  );
}
