"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABELS, clearSession, getToken } from "../lib/auth";
import { useSession } from "../lib/session";
import NotificationBell from "./NotificationBell";
import Icon from "./ui/Icon";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Shown when the user holds this permission (the server enforces it anyway). */
  permission: string;
  feature?: string;
  section: "Pilotage" | "Scolarité" | "Gestion" | "Établissement" | "Plateforme";
  /** Priority on the mobile bottom bar (lower first). */
  mobile?: number;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: "dashboard", permission: "dashboard:read", section: "Pilotage", mobile: 1 },
  { href: "/assistant", label: "Assistant IA", icon: "assistant", permission: "ai:chat", feature: "ai.chat", section: "Pilotage", mobile: 6 },
  { href: "/views", label: "Mes tableaux", icon: "grades", permission: "views:write", feature: "ai.views", section: "Pilotage" },
  { href: "/attendance", label: "Présences", icon: "attendance", permission: "attendance:write", section: "Scolarité", mobile: 2 },
  { href: "/grades", label: "Notes et bulletins", icon: "grades", permission: "grades:write", section: "Scolarité", mobile: 3 },
  { href: "/students", label: "Élèves", icon: "students", permission: "students:read", section: "Scolarité", mobile: 4 },
  { href: "/classes", label: "Classes", icon: "classes", permission: "classes:read", section: "Scolarité" },
  { href: "/timetable", label: "Emplois du temps", icon: "timetable", permission: "timetable:read", feature: "timetable", section: "Scolarité", mobile: 5 },
  { href: "/admissions", label: "Admissions", icon: "admissions", permission: "admissions:read", section: "Scolarité" },
  { href: "/parents", label: "Parents", icon: "parents", permission: "parents:read", section: "Scolarité" },
  { href: "/billing", label: "Facturation", icon: "billing", permission: "billing:read", section: "Gestion", mobile: 2 },
  { href: "/payroll", label: "Paie", icon: "payroll", permission: "payroll:read", feature: "payroll", section: "Gestion" },
  { href: "/staff", label: "Personnel", icon: "staff", permission: "staff:write", section: "Gestion" },
  { href: "/transport", label: "Transport", icon: "transport", permission: "transport:read", feature: "transport", section: "Gestion" },
  { href: "/documents", label: "Documents", icon: "documents", permission: "documents:read", feature: "documents", section: "Gestion" },
  { href: "/announcements", label: "Annonces", icon: "announcements", permission: "announcements:write", section: "Établissement" },
  { href: "/settings", label: "Vitrine et identité", icon: "settings", permission: "school:settings", section: "Établissement" },
  { href: "/audit", label: "Journal d'audit", icon: "audit", permission: "audit:read", section: "Établissement" },
  { href: "/portal", label: "Mes enfants", icon: "portal", permission: "parent-portal:read", section: "Pilotage", mobile: 1 },
  { href: "/platform", label: "Écoles et plans", icon: "platform", permission: "platform:manage", section: "Plateforme", mobile: 1 },
];

export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, loading, can, hasFeature } = useSession();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => setDrawer(false), [pathname]);

  const items = NAV_ITEMS.filter((i) => can(i.permission) && (!i.feature || hasFeature(i.feature)));
  const sections = [...new Set(items.map((i) => i.section))];
  const mobileItems = items.filter((i) => i.mobile).sort((a, b) => (a.mobile ?? 9) - (b.mobile ?? 9)).slice(0, 4);
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  const brand = (
    <div className="sidebar-brand">
      {me?.school?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.school.logoUrl} alt="" />
      ) : (
        <div className="sidebar-brand-badge" aria-hidden="true">
          {(me?.school?.name ?? "GS").slice(0, 1)}
        </div>
      )}
      <div>
        <div className="sidebar-brand-text">{me?.school?.name ?? "GESTION SCHOOL"}</div>
        <div className="sidebar-brand-sub">{me?.school ? "Espace établissement" : "Console plateforme"}</div>
      </div>
    </div>
  );

  const nav = (
    <nav className="sidebar-nav" aria-label="Navigation principale">
      {sections.map((section) => (
        <div key={section}>
          <div className="sidebar-section">{section}</div>
          {items
            .filter((i) => i.section === section)
            .map((item) => (
              <Link key={item.href} href={item.href} className={`sidebar-link${isActive(item.href) ? " active" : ""}`} aria-current={isActive(item.href) ? "page" : undefined}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <aside className="sidebar">
        {brand}
        {loading ? <div style={{ padding: 16 }}><span className="skeleton" style={{ height: 200 }} /></div> : nav}
        {me && (
          <div className="sidebar-footer">
            <Link href="/profile" className="sidebar-user" style={{ color: "var(--text)", textDecoration: "none" }}>
              {me.firstName} {me.lastName}
            </Link>
            <div className="sidebar-role">{ROLE_LABELS[me.role] || me.role}</div>
          </div>
        )}
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-actions">
            <NotificationBell />
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              <Icon name="logout" size={18} />
              <span>Déconnexion</span>
            </button>
          </div>
        </header>
        <main id="contenu" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* Mobile: 4 most used entries for the role + "Plus" */}
      <nav className="bottom-nav" aria-label="Navigation mobile">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : undefined} aria-current={isActive(item.href) ? "page" : undefined}>
            <Icon name={item.icon} size={22} />
            <span>{item.label.split(" ")[0]}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setDrawer(true)} aria-haspopup="dialog" aria-expanded={drawer}>
          <Icon name="more" size={22} />
          <span>Plus</span>
        </button>
      </nav>
      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu" onKeyDown={(e) => e.key === "Escape" && setDrawer(false)}>
            {brand}
            {nav}
            <div className="row" style={{ padding: 12 }}>
              <Link href="/profile" className="btn btn-outline btn-sm">
                Mon profil
              </Link>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawer(false)}>
                Fermer
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
