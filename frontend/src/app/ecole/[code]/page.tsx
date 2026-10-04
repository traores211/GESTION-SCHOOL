"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  Lock,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Newspaper,
  Phone,
  X,
} from "lucide-react";
import { api, ApiError } from "../../../lib/api";
import { Showcase, groupLevelsByCycle } from "../../../lib/showcase";
import { FlagBand, ThemeToggle } from "../../../components/Brand";
import { ContactForm, ContentSections } from "../../../components/showcase/ContentSections";
import { AdmissionJourney, CalendarSection, FeesSection, PortalSection, ProgramsSection, QuickAccess } from "../../../components/showcase/sections";
import "./showcase.css";

const NAV = [
  { href: "#etablissement", label: "L'établissement" },
  { href: "#programmes", label: "Programmes" },
  { href: "#admissions", label: "Admissions" },
  { href: "#frais", label: "Frais" },
  { href: "#calendrier", label: "Calendrier" },
  { href: "#actualites", label: "Actualités" },
  { href: "#contact", label: "Contact" },
];

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function whatsappLink(number: string) {
  return `https://wa.me/${number.replace(/[^\d]/g, "")}`;
}

/** Reveals sections as they scroll into view; without JavaScript everything is simply visible. */
function useReveal(ready: boolean) {
  useEffect(() => {
    if (!ready || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js-reveal");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("js-reveal");
    };
  }, [ready]);
}

export default function SchoolShowcasePage() {
  const params = useParams<{ code: string }>();
  const [data, setData] = useState<Showcase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useReveal(!!data);

  const load = useCallback(() => {
    if (!params?.code) return;
    setError(null);
    // "?apercu=1" shows the unpublished draft to the management of the school (signed in)
    const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("apercu") === "1";
    api
      .get<Showcase>(`/public/schools/${params.code}/showcase${preview ? "/preview" : ""}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Impossible de charger la page de l'établissement."));
  }, [params?.code]);

  useEffect(load, [load]);

  useEffect(() => {
    if (data) document.title = `${data.name}${data.city ? ` · ${data.city}` : ""}`;
  }, [data]);

  useEffect(() => {
    if (lightbox === null || !data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % data.photos.length));
      if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? i : (i - 1 + data.photos.length) % data.photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, data]);

  if (error) {
    return (
      <main className="sc sc-state">
        <div className="card sc-state-card">
          <div className="state state-error">
            <span className="state-icon" aria-hidden="true">
              <AlertOctagon size={20} />
            </span>
            <div className="state-title">{error}</div>
            <div className="state-action">
              <button className="btn btn-primary btn-sm" onClick={load}>
                Réessayer
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="sc" aria-busy="true">
        <div className="skeleton" style={{ height: 70, borderRadius: 0 }} />
        <div className="skeleton" style={{ height: 460, borderRadius: 0, marginTop: 2 }} />
        <div className="sc-container" style={{ marginTop: 32, display: "grid", gap: 16 }}>
          <div className="skeleton" style={{ height: 24, width: "40%" }} />
          <div className="skeleton" style={{ height: 16, width: "80%" }} />
        </div>
      </main>
    );
  }

  const logo = api.mediaUrl(data.logoUrl);
  const cover = api.mediaUrl(data.coverImageUrl);
  const cycles = groupLevelsByCycle(data.levels);
  const latest = data.announcements[0];
  const aboutImage = api.mediaUrl(data.photos[0]?.url) || cover;
  const yearsOfExperience = data.foundedYear ? new Date().getFullYear() - data.foundedYear : null;
  const socials = [
    { label: "Facebook", url: data.social.facebook },
    { label: "Instagram", url: data.social.instagram },
    { label: "LinkedIn", url: data.social.linkedin },
    { label: "YouTube", url: data.social.youtube },
  ].filter((s): s is { label: string; url: string } => !!s.url);
  const inscriptionHref = `/ecole/${data.code}/inscription`;
  const location = [data.address, data.city].filter(Boolean).join(", ");
  const fromFee = data.fees.length ? Math.min(...data.fees.map((f) => f.annual)) : null;

  const figures = [
    { value: data.studentsCount.toLocaleString("fr-FR"), label: "élèves inscrits" },
    { value: String(data.classesCount), label: data.classesCount > 1 ? "classes" : "classe" },
    ...(cycles.length > 0 ? [{ value: String(data.levels.length), label: "niveaux d'enseignement" }] : []),
    ...(yearsOfExperience && yearsOfExperience > 0 ? [{ value: String(yearsOfExperience), label: `ans d'expérience (depuis ${data.foundedYear})` }] : []),
    ...data.highlights.map((h) => ({ value: h.value, label: h.label })),
  ].slice(0, 6);

  const navItems = NAV.filter((item) => {
    if (item.href === "#programmes") return data.programs.length > 0;
    if (item.href === "#frais") return data.fees.length > 0;
    if (item.href === "#calendrier") return !!data.calendar;
    return true;
  });
  const [featured, ...otherNews] = data.announcements.slice(0, 7);

  return (
    <div className="sc" style={data.content?.primaryColor ? ({ "--school-color": data.content.primaryColor } as React.CSSProperties) : undefined}>
      {data.preview && (
        <div className="sc-preview-banner" role="status">
          Aperçu du brouillon : cette version n&apos;est pas encore publiée.
        </div>
      )}
      <FlagBand />
      {/* ---------- Top bar ---------- */}
      <div className="sc-topbar">
        <div className="sc-container">
          <div className="sc-topbar-group">
            {data.phone && (
              <a href={`tel:${data.phone.replace(/\s/g, "")}`}>
                <Phone size={14} aria-hidden="true" /> {data.phone}
              </a>
            )}
            <a href={`mailto:${data.email}`}>
              <Mail size={14} aria-hidden="true" /> {data.email}
            </a>
          </div>
          <div className="sc-topbar-group secondary">
            {socials.map((s) => (
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            ))}
            <Link href="/login">
              <Lock size={13} aria-hidden="true" /> Espace parents
            </Link>
            <ThemeToggle className="sc-theme" />
          </div>
        </div>
      </div>

      {/* ---------- Header ---------- */}
      <header className="sc-header">
        <div className="sc-container">
          <a href="#top" className="sc-brand" onClick={() => setMenuOpen(false)}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`Logo ${data.name}`} className="sc-brand-logo" />
            ) : (
              <span className="sc-brand-badge" aria-hidden="true">
                {initials(data.name)}
              </span>
            )}
            <span className="sc-brand-text">
              <span className="sc-brand-name">{data.name}</span>
              {data.city && <span className="sc-brand-sub">{data.city}, Côte d&apos;Ivoire</span>}
            </span>
          </a>
          <button type="button" className="sc-menu-toggle" aria-label="Menu" aria-expanded={menuOpen} aria-controls="sc-nav" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav id="sc-nav" className={`sc-nav${menuOpen ? " open" : ""}`} aria-label="Navigation principale">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
            <Link href={inscriptionHref} className="btn btn-primary btn-sm">
              Inscription en ligne
            </Link>
          </nav>
        </div>
      </header>

      {latest && (
        <div className="sc-flash">
          <div className="sc-container">
            <span className="sc-flash-tag">À la une</span>
            <a href="#actualites">{latest.title}</a>
          </div>
        </div>
      )}

      <main id="top">
        {/* ---------- Hero ---------- */}
        <section className={`sc-hero${cover ? " has-cover" : ""}`}>
          {cover && <div className="sc-hero-bg" style={{ backgroundImage: `url("${cover}")` }} aria-hidden="true" />}
          <div className="sc-container sc-hero-grid">
            <div className="sc-hero-inner">
              <h1>{data.name}</h1>
              {data.tagline && <p className="sc-hero-lead">{data.tagline}</p>}
              <p className="sc-hero-meta">
                {[data.academicYear ? `Année scolaire ${data.academicYear}` : null, data.foundedYear ? `Depuis ${data.foundedYear}` : null, data.city]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="sc-hero-actions">
                <Link href={inscriptionHref} className="btn btn-primary sc-btn-lg">
                  <FileSignature size={18} aria-hidden="true" /> Déposer une candidature
                </Link>
                <a href="#etablissement" className="btn btn-outline sc-btn-lg">
                  Découvrir l&apos;école
                </a>
              </div>
            </div>
            <aside className="sc-ticket" aria-label="Chiffres clés">
              <div className="sc-ticket-no">
                <span>N°</span>
                <strong>{data.code}</strong>
              </div>
              <div className="sc-ticket-body">
                <p className="sc-ticket-title">Fiche de l&apos;établissement</p>
                <dl className="sc-ticket-figures">
                  {figures.map((f) => (
                    <div key={f.label + f.value}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                  {fromFee !== null && (
                    <div>
                      <dt>scolarité annuelle à partir de</dt>
                      <dd className="sc-ticket-text">{fromFee.toLocaleString("fr-FR")} FCFA</dd>
                    </div>
                  )}
                </dl>
                {data.academicYear && <span className="stamp sc-ticket-stamp">Inscriptions {data.academicYear}</span>}
              </div>
            </aside>
          </div>
        </section>

        <QuickAccess inscriptionHref={inscriptionHref} hasFees={data.fees.length > 0} hasCalendar={!!data.calendar} />

        {/* ---------- About ---------- */}
        <section className="sc-section" id="etablissement">
          <div className={`sc-container sc-about${aboutImage ? "" : " no-media"}`} data-reveal>
            <div className="sc-about-text">
              <div className="sc-section-head">
                <h2>Découvrez notre établissement</h2>
              </div>
              {data.description ? <p>{data.description}</p> : <p className="muted">La présentation de l&apos;établissement sera bientôt disponible.</p>}
              <div className="sc-about-facts">
                {location && (
                  <div className="sc-fact">
                    <MapPin size={18} aria-hidden="true" />
                    <div>
                      <strong>Adresse</strong>
                      {location}
                    </div>
                  </div>
                )}
                {data.academicYear && (
                  <div className="sc-fact">
                    <CalendarDays size={18} aria-hidden="true" />
                    <div>
                      <strong>Année en cours</strong>
                      {data.academicYear}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {aboutImage && (
              <div className="sc-about-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={aboutImage} alt={data.photos[0]?.caption || `Vue de l'établissement ${data.name}`} />
              </div>
            )}
          </div>
        </section>

        <ContentSections content={data.content ?? {}} />

        {/* ---------- Programmes ---------- */}
        {data.programs.length > 0 && (
          <section className="sc-section sc-section-alt" id="programmes">
            <div className="sc-container" data-reveal>
              <div className="sc-section-head">
                <h2>Programmes &amp; niveaux</h2>
                <p>Choisissez un niveau pour voir les matières enseignées cette année et leur coefficient.</p>
              </div>
              <ProgramsSection programs={data.programs} cycles={cycles} />
            </div>
          </section>
        )}

        {/* ---------- Admissions ---------- */}
        <section className="sc-section" id="admissions">
          <div className="sc-container" data-reveal>
            <div className="sc-section-head">
              <h2>Rejoindre l&apos;établissement</h2>
              <p>Le parcours d&apos;admission, de la première prise de contact à l&apos;inscription.</p>
            </div>
            <AdmissionJourney inscriptionHref={inscriptionHref} academicYear={data.academicYear} />
          </div>
        </section>

        {/* ---------- Fees ---------- */}
        {data.fees.length > 0 && (
          <section className="sc-section sc-section-alt" id="frais">
            <div className="sc-container" data-reveal>
              <div className="sc-section-head">
                <h2>Frais de scolarité</h2>
                <p>Les montants de l&apos;année et leur échéancier, niveau par niveau.</p>
              </div>
              <FeesSection fees={data.fees} academicYear={data.academicYear} />
            </div>
          </section>
        )}

        {/* ---------- Calendar ---------- */}
        {data.calendar && (
          <section className="sc-section" id="calendrier">
            <div className="sc-container" data-reveal>
              <div className="sc-section-head">
                <h2>Calendrier de l&apos;année {data.academicYear}</h2>
                <p>Trimestres, vacances et échéances de scolarité.</p>
              </div>
              <CalendarSection calendar={data.calendar} fees={data.fees} />
            </div>
          </section>
        )}

        {/* ---------- Gallery ---------- */}
        {data.photos.length > 0 && (
          <section className="sc-section sc-section-alt" id="vie-scolaire">
            <div className="sc-container" data-reveal>
              <div className="sc-section-head">
                <h2>La vie scolaire en images</h2>
              </div>
              <div className={`sc-gallery${data.photos.length >= 5 ? " featured" : ""}`}>
                {data.photos.slice(0, 9).map((photo, index) => (
                  <button type="button" key={photo.id} onClick={() => setLightbox(index)} aria-label={`Agrandir ${photo.caption || `la photo ${index + 1}`}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={api.mediaUrl(photo.url) || ""} alt={photo.caption || ""} loading="lazy" />
                    {photo.caption && <figcaption>{photo.caption}</figcaption>}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- News: one featured, the rest as a dated list ---------- */}
        <section className="sc-section" id="actualites">
          <div className="sc-container" data-reveal>
            <div className="sc-section-head">
              <h2>Actualités</h2>
              <p>La vie de l&apos;établissement, publiée par l&apos;équipe.</p>
            </div>
            {!featured ? (
              <div className="card">
                <div className="state">
                  <span className="state-icon" aria-hidden="true">
                    <Newspaper size={20} />
                  </span>
                  <div className="state-title">Aucune actualité publiée pour le moment</div>
                </div>
              </div>
            ) : (
              <div className="sc-newsroom">
                <article className="sc-news-featured">
                  {api.mediaUrl(featured.imageUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={api.mediaUrl(featured.imageUrl) || ""} alt="" />
                  )}
                  <div>
                    <time dateTime={featured.publishedAt}>{formatDay(featured.publishedAt)}</time>
                    <h3>{featured.title}</h3>
                    <p>{expanded[featured.id] || featured.content.length <= 320 ? featured.content : `${featured.content.slice(0, 320).trimEnd()}…`}</p>
                    {featured.content.length > 320 && (
                      <button type="button" className="sc-link-btn" aria-expanded={!!expanded[featured.id]} onClick={() => setExpanded((e) => ({ ...e, [featured.id]: !e[featured.id] }))}>
                        {expanded[featured.id] ? "Réduire" : "Lire la suite"}
                      </button>
                    )}
                  </div>
                </article>
                {otherNews.length > 0 && (
                  <ol className="sc-news-list">
                    {otherNews.map((a) => {
                      const open = expanded[a.id];
                      return (
                        <li key={a.id}>
                          <span className="sc-news-day">
                            <strong>{new Date(a.publishedAt).getDate()}</strong>
                            <small>{new Date(a.publishedAt).toLocaleDateString("fr-FR", { month: "short" })}</small>
                          </span>
                          <div>
                            <h3>{a.title}</h3>
                            <p>{open || a.content.length <= 140 ? a.content : `${a.content.slice(0, 140).trimEnd()}…`}</p>
                            {a.content.length > 140 && (
                              <button type="button" className="sc-link-btn" aria-expanded={!!open} onClick={() => setExpanded((e) => ({ ...e, [a.id]: !open }))}>
                                {open ? "Réduire" : "Lire la suite"}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ---------- Secure portal ---------- */}
        <section className="sc-section sc-portal-section" id="espace">
          <div className="sc-container" data-reveal>
            <PortalSection schoolName={data.name} />
          </div>
        </section>

        {/* ---------- Testimonials ---------- */}
        {data.testimonials.length > 0 && (
          <section className="sc-section" id="temoignages">
            <div className="sc-container" data-reveal>
              <div className="sc-section-head center">
                <h2>Ils nous font confiance</h2>
              </div>
              <div className="sc-testimonials">
                {data.testimonials.map((t) => {
                  const photo = api.mediaUrl(t.photoUrl);
                  return (
                    <figure className="sc-quote" key={t.id}>
                      <blockquote>{t.content}</blockquote>
                      <figcaption className="sc-quote-author">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt="" className="sc-avatar" />
                        ) : (
                          <span className="sc-avatar" aria-hidden="true">
                            {initials(t.authorName)}
                          </span>
                        )}
                        <div>
                          <strong>{t.authorName}</strong>
                          {t.authorRole && <span>{t.authorRole}</span>}
                        </div>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Partners ---------- */}
        {data.partners.length > 0 && (
          <section className="sc-section sc-section-alt" id="partenaires">
            <div className="sc-container" data-reveal>
              <div className="sc-section-head center">
                <h2>Nos partenaires</h2>
              </div>
              <div className="sc-partners">
                {data.partners.map((p) => {
                  const partnerLogo = api.mediaUrl(p.logoUrl);
                  const content = (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {partnerLogo && <img src={partnerLogo} alt="" loading="lazy" />}
                      <span>{p.name}</span>
                    </>
                  );
                  return p.website ? (
                    <a key={p.id} className="sc-partner" href={p.website} target="_blank" rel="noopener noreferrer">
                      {content}
                    </a>
                  ) : (
                    <div key={p.id} className="sc-partner">
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Contact ---------- */}
        <section className="sc-section" id="contact">
          <div className="sc-container" data-reveal>
            <div className="sc-section-head">
              <h2>Nous contacter</h2>
              <p>Le secrétariat répond à vos questions sur les inscriptions, la scolarité et la vie de l&apos;établissement.</p>
            </div>
            <div className="sc-contact">
              {location && (
                <div className="sc-contact-card">
                  <span className="sc-contact-icon" aria-hidden="true">
                    <MapPin size={18} />
                  </span>
                  <div>
                    <strong>Adresse</strong>
                    <span>{location}</span>
                    {data.mapUrl && (
                      <div className="sc-contact-more">
                        <a href={data.mapUrl} target="_blank" rel="noopener noreferrer">
                          Voir sur la carte ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {data.phone && (
                <a className="sc-contact-card" href={`tel:${data.phone.replace(/\s/g, "")}`}>
                  <span className="sc-contact-icon" aria-hidden="true">
                    <Phone size={18} />
                  </span>
                  <div>
                    <strong>Téléphone</strong>
                    <span>{data.phone}</span>
                  </div>
                </a>
              )}
              {data.whatsappNumber && (
                <a className="sc-contact-card" href={whatsappLink(data.whatsappNumber)} target="_blank" rel="noopener noreferrer">
                  <span className="sc-contact-icon" aria-hidden="true">
                    <MessageCircle size={18} />
                  </span>
                  <div>
                    <strong>WhatsApp</strong>
                    <span>{data.whatsappNumber}</span>
                  </div>
                </a>
              )}
              <a className="sc-contact-card" href={`mailto:${data.email}`}>
                <span className="sc-contact-icon" aria-hidden="true">
                  <Mail size={18} />
                </span>
                <div>
                  <strong>E-mail</strong>
                  <span>{data.email}</span>
                </div>
              </a>
            </div>
            <ContactForm code={data.code} />
          </div>
        </section>

        {/* ---------- Closing call ---------- */}
        <section className="sc-close">
          <div className="sc-container">
            <div>
              <h2>Une place pour votre enfant en {data.academicYear || "cette année"} ?</h2>
              <p>La candidature se fait en ligne, en quelques minutes.</p>
            </div>
            <Link href={inscriptionHref} className="btn btn-primary sc-btn-lg">
              Déposer une candidature <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="sc-footer">
        <div className="sc-container">
          <div className="sc-footer-grid">
            <div>
              <h4>{data.name}</h4>
              {data.tagline && <p>{data.tagline}</p>}
              {socials.length > 0 && (
                <div className="sc-social">
                  {socials.map((s) => (
                    <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4>Liens rapides</h4>
              <ul>
                {navItems.map((item) => (
                  <li key={item.href}>
                    <a href={item.href}>{item.label}</a>
                  </li>
                ))}
                <li>
                  <Link href={inscriptionHref}>Inscription en ligne</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Accès</h4>
              <ul>
                <li>
                  <Link href="/login">Espace parents &amp; personnel</Link>
                </li>
                {data.website && (
                  <li>
                    <a href={data.website} target="_blank" rel="noopener noreferrer">
                      Site web officiel ↗
                    </a>
                  </li>
                )}
                {location && <li>{location}</li>}
              </ul>
            </div>
          </div>
          <div className="sc-footer-bottom">
            <span>
              © {new Date().getFullYear()} {data.name}. Tous droits réservés.
            </span>
            <span>Propulsé par School ERP</span>
          </div>
        </div>
      </footer>

      {lightbox !== null && data.photos[lightbox] && (
        <div className="sc-lightbox" role="dialog" aria-modal="true" aria-label="Galerie photo" onClick={() => setLightbox(null)}>
          <button type="button" className="sc-lightbox-close" aria-label="Fermer" onClick={() => setLightbox(null)}>
            <X size={22} />
          </button>
          {data.photos.length > 1 && (
            <>
              <button
                type="button"
                className="sc-lightbox-nav prev"
                aria-label="Photo précédente"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox - 1 + data.photos.length) % data.photos.length);
                }}
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                className="sc-lightbox-nav next"
                aria-label="Photo suivante"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox + 1) % data.photos.length);
                }}
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
          <figure onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={api.mediaUrl(data.photos[lightbox].url) || ""} alt={data.photos[lightbox].caption || ""} />
            {data.photos[lightbox].caption && <figcaption>{data.photos[lightbox].caption}</figcaption>}
          </figure>
        </div>
      )}
    </div>
  );
}
