import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CSSProperties } from "react";
import { serverGet } from "../../../lib/server-api";
import ContactForm from "./ContactForm";

interface Section {
  type: string;
  enabled: boolean;
  title?: string;
  content?: string;
  items?: { title?: string; text?: string; imageUrl?: string; url?: string; date?: string }[];
}
interface Showcase {
  name: string;
  code: string;
  tagline: string | null;
  description: string | null;
  directeur: string | null;
  city: string | null;
  address: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  branding: { logoUrl: string | null; faviconUrl: string | null; primaryColor: string | null; secondaryColor: string | null; footerText: string | null };
  socialLinks: Record<string, string>;
  seo: { title: string; description: string };
  sections: Section[];
  levels: string[];
  studentsCount: number;
  announcements: { id: string; title: string; content: string; publishedAt: string }[];
}

const load = (code: string) => serverGet<Showcase>(`/public/schools/${encodeURIComponent(code)}/showcase`, 60);

/** Server-rendered: search engines and link previews (WhatsApp, Facebook) see the real content. */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const s = await load(code);
  if (!s) return { title: "Établissement introuvable" };
  return {
    title: { absolute: s.seo.title },
    description: s.seo.description,
    icons: s.branding.faviconUrl ? { icon: s.branding.faviconUrl } : undefined,
    openGraph: {
      title: s.seo.title,
      description: s.seo.description,
      type: "website",
      locale: "fr_FR",
      siteName: s.name,
      images: s.branding.logoUrl ? [{ url: s.branding.logoUrl }] : undefined,
    },
  };
}

const safeHex = (v: string | null, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

export default async function ShowcasePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const s = await load(code);
  if (!s) notFound();

  const style = { "--brand": safeHex(s.branding.primaryColor, "#1f5f4a"), "--accent": safeHex(s.branding.secondaryColor, "#b45309") } as CSSProperties;
  const visible = s.sections.filter((x) => x.enabled);
  const has = (t: string) => visible.some((x) => x.type === t);
  const socials = Object.entries(s.socialLinks ?? {}).filter(([, v]) => v);
  const socialHref = (k: string, v: string) => (k === "whatsapp" ? `https://wa.me/${v.replace(/\D/g, "")}` : v);
  const container: CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "0 20px" };

  const renderSection = (sec: Section) => {
    const title = sec.title;
    switch (sec.type) {
      case "hero":
        return null;
      case "about":
        return s.description || sec.content ? <p style={{ whiteSpace: "pre-wrap", fontSize: 16 }}>{sec.content || s.description}</p> : null;
      case "levels":
        return s.levels.length ? (
          <ul className="row" style={{ listStyle: "none" }}>
            {s.levels.map((l) => (
              <li key={l} className="badge badge-green" style={{ fontSize: 14, padding: "6px 12px" }}>
                {l}
              </li>
            ))}
          </ul>
        ) : null;
      case "news":
        return s.announcements.length ? (
          <div className="grid-2">
            {s.announcements.map((a) => (
              <article key={a.id} className="card">
                <h3>{a.title}</h3>
                <p className="muted" style={{ fontSize: 13 }}>
                  {new Date(a.publishedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
                <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{a.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Aucune actualité pour le moment.</p>
        );
      case "admissions":
        return (
          <div className="card row" style={{ justifyContent: "space-between" }}>
            <p>{sec.content || "Les demandes de préinscription sont ouvertes en ligne : l'établissement vous recontacte rapidement."}</p>
            <Link href={`/ecole/${s.code}/inscription`} className="btn btn-primary">
              Préinscrire mon enfant
            </Link>
          </div>
        );
      case "contact":
        return (
          <div className="grid-2">
            <address style={{ fontStyle: "normal" }} className="stack">
              {s.address && <span>{s.address}</span>}
              {s.city && <span>{s.city}</span>}
              {s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>}
              <a href={`mailto:${s.email}`}>{s.email}</a>
              {s.latitude !== null && s.longitude !== null && (
                <a href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=16/${s.latitude}/${s.longitude}`} target="_blank" rel="noopener noreferrer">
                  Voir sur la carte
                </a>
              )}
            </address>
            <ContactForm code={s.code} />
          </div>
        );
      default:
        return (
          <>
            {sec.content && <p style={{ whiteSpace: "pre-wrap", fontSize: 16 }}>{sec.content}</p>}
            {sec.items && sec.items.length > 0 && (
              <div className="grid-2" style={{ marginTop: 12 }}>
                {sec.items.map((it, i) => (
                  <div key={i} className="card">
                    {it.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.imageUrl} alt={it.title ?? ""} loading="lazy" style={{ width: "100%", borderRadius: 8, marginBottom: 8, aspectRatio: "4 / 3", objectFit: "cover" }} />
                    )}
                    {it.title && <h3>{it.title}</h3>}
                    {it.date && <p className="muted">{it.date}</p>}
                    {it.text && <p style={{ whiteSpace: "pre-wrap" }}>{it.text}</p>}
                    {it.url && (
                      <a href={it.url} target="_blank" rel="noopener noreferrer">
                        {sec.type === "documents" ? "Télécharger" : "En savoir plus"}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        );
    }
    void title;
  };

  return (
    <div style={style}>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ ...container, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 64, flexWrap: "wrap" }}>
          <div className="row">
            {s.branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.branding.logoUrl} alt={`Logo ${s.name}`} style={{ height: 40, width: "auto" }} />
            ) : (
              <span className="sidebar-brand-badge" aria-hidden="true">
                {s.name.slice(0, 1)}
              </span>
            )}
            <strong style={{ fontSize: 17 }}>{s.name}</strong>
          </div>
          <nav aria-label="Sections" className="row">
            {visible
              .filter((x) => x.type !== "hero" && x.title)
              .slice(0, 5)
              .map((x) => (
                <a key={x.type} href={`#${x.type}`} className="btn btn-ghost btn-sm">
                  {x.title}
                </a>
              ))}
          </nav>
        </div>
      </header>

      <main id="contenu">
        {has("hero") && (
          <section style={{ background: "var(--brand)", color: "#fff", padding: "64px 0" }}>
            <div style={container}>
              <h1 style={{ color: "#fff", fontSize: "clamp(28px, 5vw, 44px)", maxWidth: 760 }}>{s.name}</h1>
              {s.tagline && <p style={{ fontSize: 19, marginTop: 12, maxWidth: 680, opacity: 0.95 }}>{s.tagline}</p>}
              <div className="row" style={{ marginTop: 24 }}>
                {has("admissions") && (
                  <Link href={`/ecole/${s.code}/inscription`} className="btn" style={{ background: "#fff", color: "var(--brand-strong)" }}>
                    Préinscrire mon enfant
                  </Link>
                )}
                {has("contact") && (
                  <a href="#contact" className="btn" style={{ border: "1px solid #fff", color: "#fff" }}>
                    Nous contacter
                  </a>
                )}
              </div>
              <p style={{ marginTop: 24, opacity: 0.9 }}>
                {s.city && `${s.city} · `}
                {s.studentsCount} élèves · {s.levels.length} niveaux
              </p>
            </div>
          </section>
        )}

        {visible
          .filter((x) => x.type !== "hero")
          .map((sec, i) => {
            const body = renderSection(sec);
            if (!body) return null;
            return (
              <section key={sec.type} id={sec.type} aria-labelledby={`h-${sec.type}`} style={{ padding: "48px 0", background: i % 2 ? "var(--surface)" : "transparent" }}>
                <div style={container}>
                  <h2 id={`h-${sec.type}`} style={{ marginBottom: 20, fontSize: 26 }}>
                    {sec.title ?? ""}
                  </h2>
                  {sec.type === "director" && s.directeur && <p className="muted" style={{ marginBottom: 8 }}>{s.directeur}</p>}
                  {body}
                </div>
              </section>
            );
          })}
      </main>

      <footer style={{ borderTop: "1px solid var(--border)", padding: "24px 0", background: "var(--surface)" }}>
        <div style={{ ...container, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span className="muted">
            © {new Date().getFullYear()} {s.name}
            {s.branding.footerText ? ` — ${s.branding.footerText}` : ""}
          </span>
          {socials.length > 0 && (
            <ul className="row" style={{ listStyle: "none" }} aria-label="Réseaux sociaux">
              {socials.map(([k, v]) => (
                <li key={k}>
                  <a href={socialHref(k, v)} target="_blank" rel="noopener noreferrer">
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </footer>
    </div>
  );
}
