"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, FileUp, Settings2, Sparkles, Users } from "lucide-react";
import { getStoredUser } from "../../lib/auth";
import { EDITOR_ROLES } from "../../lib/timetable";

const ITEMS = [
  { href: "/timetable", label: "Grille", icon: CalendarDays, editor: false },
  { href: "/timetable/generate", label: "Génération", icon: Sparkles, editor: true },
  { href: "/timetable/compliance", label: "Conformité", icon: ClipboardCheck, editor: false },
  { href: "/timetable/planning", label: "Professeurs & volumes", icon: Users, editor: true },
  { href: "/timetable/manage", label: "Paramètres", icon: Settings2, editor: true },
  { href: "/timetable/import", label: "Importer un EDT", icon: FileUp, editor: true },
];

/** Sections of the timetable module. */
export default function TimetableNav() {
  const pathname = usePathname();
  const canEdit = EDITOR_ROLES.includes(getStoredUser()?.role ?? "");
  return (
    <nav className="tabs tt-nav" aria-label="Emplois du temps">
      {ITEMS.filter((i) => canEdit || !i.editor).map(({ href, label, icon: Icon }) => {
        const active = href === "/timetable" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={16} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
