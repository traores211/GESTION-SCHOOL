"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  BookOpen,
  Bus,
  CalendarDays,
  ClipboardCheck,
  FileSignature,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  School,
  FileSpreadsheet,
  LockKeyhole,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AuthUser, ROLE_LABELS, getStoredUser, getToken } from "../lib/auth";
import { logout, refreshAccessToken } from "../lib/api";
import NotificationBell from "./NotificationBell";
import { BrandMark, FlagBand, ThemeToggle } from "./Brand";
import AssistantPanel from "./assistant/AssistantPanel";
import OfflineSync from "./OfflineSync";
import { Avatar } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
}

const ADMIN = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];
const OFFICE = [...ADMIN, "SECRETARY"];
const TEACHING = [...OFFICE, "ENSEIGNANT"];
const STAFF = [...TEACHING, "COMPTABLE"];

/** Mirrors the API role groups (backend/src/common/roles.ts): the API enforces them, the menu only hides. */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Pilotage",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: STAFF },
      { href: "/timetable", label: "Emplois du temps", icon: CalendarDays, roles: STAFF },
    ],
  },
  {
    group: "Scolarité",
    items: [
      { href: "/students", label: "Élèves", icon: GraduationCap, roles: TEACHING },
      { href: "/classes", label: "Classes", icon: School, roles: TEACHING },
      { href: "/attendance", label: "Présence", icon: ClipboardCheck, roles: TEACHING },
      { href: "/grades", label: "Notes & bulletins", icon: BookOpen, roles: [...ADMIN, "ENSEIGNANT"] },
      { href: "/admissions", label: "Admissions", icon: FileSignature, roles: OFFICE },
      { href: "/parents", label: "Parents", icon: Users, roles: OFFICE },
    ],
  },
  {
    group: "Gestion",
    items: [
      { href: "/staff", label: "Personnel", icon: UserRound, roles: ADMIN },
      { href: "/billing", label: "Facturation", icon: Wallet, roles: [...OFFICE, "COMPTABLE"] },
      { href: "/payroll", label: "Paie", icon: Banknote, roles: [...ADMIN, "COMPTABLE"] },
      { href: "/transport", label: "Transport", icon: Bus, roles: OFFICE },
      { href: "/imports", label: "Imports Excel", icon: FileSpreadsheet, roles: STAFF },
      { href: "/messaging", label: "Messages aux familles", icon: MessageSquareText, roles: [...OFFICE, "COMPTABLE"] },
      { href: "/announcements", label: "Annonces & vitrine", icon: Megaphone, roles: ADMIN },
      { href: "/audit", label: "Journal d'audit", icon: ScrollText, roles: ADMIN },
      { href: "/privacy", label: "Données personnelles", icon: LockKeyhole, roles: ADMIN },
    ],
  },
  {
    group: "Famille",
    items: [{ href: "/portal", label: "Mes enfants", icon: HeartHandshake, roles: ["PARENT"] }],
  },
];

export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number; animate: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ready = () => {
      if (cancelled) return;
      setUser(getStoredUser());
      setChecked(true);
    };
    if (getToken()) return ready();
    // No access token in this tab: the HttpOnly refresh cookie may still hold a session.
    refreshAccessToken().then((token) => {
      if (token) ready();
      else if (!cancelled) router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    });
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen && !navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setNavOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen, navOpen]);

  useEffect(() => {
    document.title = `${title} · School ERP`;
  }, [title]);

  // The orange pill behind the active item glides from where it was on the previous page.
  useEffect(() => {
    if (!checked) return;
    const link = navRef.current?.querySelector<HTMLElement>(".sidebar-link.active");
    if (!link) {
      setPill(null);
      return;
    }
    const next = { top: link.offsetTop, height: link.offsetHeight };
    let prev: { top: number; height: number } | null = null;
    try {
      prev = JSON.parse(sessionStorage.getItem("navPill") || "null");
      sessionStorage.setItem("navPill", JSON.stringify(next));
    } catch {
      /* storage unavailable: no glide, the pill simply appears */
    }
    if (prev && prev.top !== next.top) {
      setPill({ ...prev, animate: false });
      requestAnimationFrame(() => requestAnimationFrame(() => setPill({ ...next, animate: true })));
    } else {
      setPill({ ...next, animate: false });
    }
  }, [checked, pathname]);
  if (!checked) {
    return (
      <div className="shell-loading" aria-busy="true">
        <div className="shell-loading-side" />
        <div className="shell-loading-main">
          <span className="visually-hidden">Chargement…</span>
          <div className="skeleton" style={{ height: 30, width: "34%" }} />
          <div className="skeleton" style={{ height: 14, width: "52%" }} />
          <div className="skeleton" style={{ height: 180, marginTop: 18 }} />
        </div>
      </div>
    );
  }

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((item) => !user || item.roles.includes(user.role)) })).filter((g) => g.items.length);
  const fullName = user ? `${user.firstName} ${user.lastName}` : "";

  const signOut = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="app-root">
    <FlagBand pinned />
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />
      <aside className="sidebar" id="app-sidebar" aria-label="Navigation principale">
        <Link href={user?.role === "PARENT" ? "/portal" : "/dashboard"} className="sidebar-brand">
          <BrandMark />
          <span>
            <span className="sidebar-brand-text">School ERP</span>
            <span className="sidebar-brand-sub">Côte d&apos;Ivoire</span>
          </span>
        </Link>
        <nav className={`sidebar-nav${pill ? " has-pill" : ""}`} ref={navRef}>
          {pill && (
            <span
              className="nav-pill"
              aria-hidden="true"
              style={{ transform: `translateY(${pill.top}px)`, height: pill.height, transition: pill.animate ? undefined : "none" }}
            />
          )}
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={g.group}>
              {groups.length > 1 && <div className="sidebar-group">{g.group}</div>}
              {g.items.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`sidebar-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {user && (
          <div className="sidebar-footer">
            <Avatar name={fullName} />
            <div className="sidebar-footer-text">
              <div className="sidebar-user">{fullName}</div>
              <div className="sidebar-role">{ROLE_LABELS[user.role] || user.role}</div>
            </div>
          </div>
        )}
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="btn btn-ghost btn-icon menu-toggle"
              aria-label="Ouvrir le menu"
              aria-controls="app-sidebar"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((o) => !o)}
            >
              <Menu size={20} />
            </button>
            <div className="topbar-title">{title}</div>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <NotificationBell />
            {user && (
              <div className="menu-anchor" ref={menuRef}>
                <button
                  type="button"
                  className="btn btn-ghost account-btn"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Menu du compte"
                >
                  <Avatar name={fullName} size="sm" />
                  <span className="hide-sm account-name">{user.firstName}</span>
                </button>
                {menuOpen && (
                  <div className="menu" role="menu">
                    <div className="menu-header">
                      <div className="menu-who">{fullName}</div>
                      <div className="menu-email">{user.email}</div>
                      <span className="badge badge-neutral">{ROLE_LABELS[user.role] || user.role}</span>
                    </div>
                    <Link href="/account" role="menuitem" className="menu-item">
                      <ShieldCheck size={16} /> Sécurité du compte
                      {user.totpRecommended && <span className="badge badge-warning">2FA</span>}
                    </Link>
                    <button type="button" role="menuitem" className="menu-item danger" onClick={signOut}>
                      <LogOut size={16} /> Se déconnecter
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <main id="main" className="page-content page-enter" key={pathname} tabIndex={-1}>
          {user?.totpRecommended && pathname !== "/account" && (
            <div className="alert alert-warning" role="status" style={{ marginBottom: 16 }}>
              <ShieldCheck size={17} />
              <div className="alert-body">
                <span className="alert-title">Protégez votre compte.</span> Votre rôle donne accès à des données sensibles : activez la double authentification.{" "}
                <Link href="/account">Activer maintenant</Link>
              </div>
            </div>
          )}
          {user && user.role !== "PARENT" && <OfflineSync />}
          {children}
        </main>
        {user && user.role !== "PARENT" && <AssistantPanel />}
      </div>
    </div>
    </div>
  );
}
