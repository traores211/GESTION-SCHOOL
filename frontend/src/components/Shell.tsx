"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthUser, ROLE_LABELS, clearSession, getStoredUser, getToken } from "../lib/auth";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: "📊", roles: ["SUPER_ADMIN", "DIRECTOR", "SECRETARY", "COMPTABLE", "ENSEIGNANT"] },
  { href: "/students", label: "Élèves", icon: "🎓", roles: ["SUPER_ADMIN", "DIRECTOR", "SECRETARY", "ENSEIGNANT"] },
  { href: "/parents", label: "Parents", icon: "👪", roles: ["SUPER_ADMIN", "DIRECTOR", "SECRETARY"] },
  { href: "/staff", label: "Enseignants & Personnel", icon: "🧑‍🏫", roles: ["SUPER_ADMIN", "DIRECTOR"] },
  { href: "/classes", label: "Classes", icon: "🏫", roles: ["SUPER_ADMIN", "DIRECTOR", "SECRETARY", "ENSEIGNANT"] },
  { href: "/admissions", label: "Admissions", icon: "📝", roles: ["SUPER_ADMIN", "DIRECTOR", "SECRETARY"] },
  { href: "/attendance", label: "Présence", icon: "✅", roles: ["SUPER_ADMIN", "DIRECTOR", "SECRETARY", "ENSEIGNANT"] },
  { href: "/grades", label: "Notes & Bulletins", icon: "📚", roles: ["SUPER_ADMIN", "DIRECTOR", "ENSEIGNANT"] },
  { href: "/billing", label: "Facturation", icon: "💰", roles: ["SUPER_ADMIN", "DIRECTOR", "SECRETARY", "COMPTABLE"] },
  { href: "/portal", label: "Mes enfants", icon: "👨‍👩‍👧", roles: ["PARENT"] },
];

export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
    setChecked(true);
  }, [router]);

  if (!checked) return null;

  const items = NAV_ITEMS.filter((item) => !user || item.roles.includes(user.role));

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-badge">🎓</div>
          <div>
            <div className="sidebar-brand-text">School ERP</div>
            <div className="sidebar-brand-sub">Côte d&apos;Ivoire</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${pathname?.startsWith(item.href) ? " active" : ""}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        {user && (
          <div className="sidebar-footer">
            <div className="sidebar-user">
              {user.firstName} {user.lastName}
            </div>
            <div className="sidebar-role">{ROLE_LABELS[user.role] || user.role}</div>
          </div>
        )}
      </aside>
      <div className="main-area">
        <div className="flag-stripe" />
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <button className="btn btn-outline btn-sm" onClick={logout}>
            Déconnexion
          </button>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
