"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../../../lib/api";
import { ADMISSION_STEPS, Showcase, groupLevelsByCycle } from "../../../lib/showcase";
import { ClassroomScene, KidsOnTheWay, SchoolkidsHero } from "../../../components/illustrations/Schoolkids";
import "./showcase.css";

const NAV = [
  { href: "#etablissement", label: "L'établissement" },
  { href: "#niveaux", label: "Nos niveaux" },
  { href: "#vie-scolaire", label: "Vie scolaire" },
  { href: "#actualites", label: "Actualités" },
  { href: "#admissions", label: "Admissions" },
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

export default function SchoolShowcasePage() {
  const params = useParams<{ code: string }>();
  const [data, setData] = useState<Showcase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    if (!params?.code) return;
    setError(null);
    api
      .get<Showcase>(`/public/schools/${params.code}/showcase`)
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
        <div className="card" style={{ maxWidth: 440, textAlign: "center" }}>
          <div className="state state-error">
            <span className="state-icon" aria-hidden="true">!</span>
            <div className="state-title">{error}</div>
            <button className="btn btn-primary btn-sm" onClick={load} style={{ marginTop: 8 }}>
              Réessayer
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="sc" aria-busy="true">
        <div className="skeleton" style={{ height: 70, borderRadius: 0 }} />
        <div className="skeleton" style={{ height: 420, borderRadius: 0, marginTop: 2 }} />
        <div className="sc-container" style={{ marginTop: 32, display: "grid", gap: 16 }}>
          <div className="skeleton" style={{ height: 24, width: "40%" }} />
          <div className="skeleton" style={{ height: 16, width: "80%" }} />
          <div className="skeleton" style={{ height: 16, width: "70%" }} />
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

  const figures = [
    { value: data.studentsCount.toLocaleString("fr-FR"), label: "élèves inscrits" },
    { value: String(data.classesCount), label: data.classesCount > 1 ? "classes" : "classe" },
    ...(cycles.length > 0 ? [{ value: String(data.levels.length), label: "niveaux d'enseignement" }] : []),
    ...(yearsOfExperience && yearsOfExperience > 0
      ? [{ value: String(yearsOfExperience), label: `ans d'expérience (depuis ${data.foundedYear})` }]
      : []),
    ...data.highlights.map((h) => ({ value: h.value, label: h.label })),
  ].slice(0, 6);

  const navItems = NAV.filter((item) => {
    if (item.href === "#vie-scolaire") return data.photos.length > 0;
    if (item.href === "#niveaux") return cycles.length > 0;
    return true;
  });

  return (
    <div className="sc">
      {/* ---------- Top bar ---------- */}
      <div className="sc-topbar">
        <div className="sc-container">
          <div className="sc-topbar-group">
            {data.phone && <a href={`tel:${data.phone.replace(/\s/g, "")}`}>📞 {data.phone}</a>}
            <a href={`mailto:${data.email}`}>✉️ {data.email}</a>
          </div>
          <div className="sc-topbar-group secondary">
            {socials.map((s) => (
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            ))}
            <Link href="/login">Espace établissement</Link>
          </div>
        </div>
      </div>

      {/* ---------- Header ---------- */}
      <header className="sc-header">
        <div className="sc-container" style={{ position: "relative" }}>
          <a href="#top" className="sc-brand" onClick={() => setMenuOpen(false)}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`Logo ${data.name}`} className="sc-brand-logo" />
            ) : (
              <span className="sc-brand-badge" aria-hidden="true">🎓</span>
            )}
            <span style={{ minWidth: 0 }}>
              <span className="sc-brand-name" style={{ display: "block" }}>{data.name}</span>
              {data.city && <span className="sc-brand-sub">{data.city}, Côte d&apos;Ivoire</span>}
            </span>
          </a>
          <button
            type="button"
            className="sc-menu-toggle"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="sc-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? "✕" : "☰"}
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

      {/* ---------- Flash info ---------- */}
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
        <section className="sc-hero">
          {cover && <div className="sc-hero-bg" style={{ backgroundImage: `url("${cover}")` }} aria-hidden="true" />}
          {/* Sans photo de couverture, une illustration d'écoliers habille le bandeau. */}
          <div className={`sc-container${cover ? "" : " sc-hero-grid"}`}>
            <div className="sc-hero-inner">
              <div className="sc-eyebrow">
                {data.academicYear ? `Année scolaire ${data.academicYear}` : "Bienvenue"}
                {data.foundedYear ? ` · Depuis ${data.foundedYear}` : ""}
              </div>
              <h1>{data.name}</h1>
              {data.tagline && <p>{data.tagline}</p>}
              <div className="sc-hero-actions">
                <Link href={inscriptionHref} className="btn btn-primary sc-btn-lg">
                  📝 Déposer une candidature
                </Link>
                <a href="#contact" className="btn sc-btn-ghost sc-btn-lg">
                  Nous contacter
                </a>
              </div>
            </div>
            {!cover && (
              <div className="sc-hero-art">
                <SchoolkidsHero title={`Illustration : des écoliers souriants devant ${data.name}`} />
              </div>
            )}
          </div>
        </section>
        <div className="flag-stripe" />

        {/* ---------- Key figures ---------- */}
        <section className="sc-figures" aria-label="Chiffres clés">
          <div className="sc-container">
            <div className="sc-figures-grid">
              {figures.map((f) => (
                <div className="sc-figure" key={f.label + f.value}>
                  <div className="sc-figure-value">{f.value}</div>
                  <div className="sc-figure-label">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- About ---------- */}
        <section className="sc-section" id="etablissement">
          <div className="sc-container sc-about">
            <div className="sc-about-text">
              <div className="sc-kicker">L&apos;établissement</div>
              <div className="sc-section-head" style={{ marginBottom: 20 }}>
                <h2>Découvrez notre établissement</h2>
              </div>
              {data.description ? (
                <p>{data.description}</p>
              ) : (
                <p className="muted">La présentation de l&apos;établissement sera bientôt disponible.</p>
              )}
              <div className="sc-about-facts">
                {location && (
                  <div className="sc-fact">
                    <span aria-hidden="true">📍</span>
                    <div>
                      <strong>Adresse</strong>
                      {location}
                    </div>
                  </div>
                )}
                {data.academicYear && (
                  <div className="sc-fact">
                    <span aria-hidden="true">🗓️</span>
                    <div>
                      <strong>Année en cours</strong>
                      {data.academicYear}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="sc-about-media">
              {aboutImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={aboutImage} alt={data.photos[0]?.caption || `Vue de l'établissement ${data.name}`} />
              ) : (
                <ClassroomScene title={`Illustration : des écoliers en classe à ${data.name}`} />
              )}
            </div>
          </div>
        </section>

        {/* ---------- Levels ---------- */}
        {cycles.length > 0 && (
          <section className="sc-section sc-section-alt" id="niveaux">
            <div className="sc-container">
              <div className="sc-section-head center">
                <div className="sc-kicker">Enseignement</div>
                <h2>Nos niveaux</h2>
                <p>Les classes ouvertes pour l&apos;année {data.academicYear || "en cours"}.</p>
              </div>
              <div className="sc-cycles">
                {cycles.map((cycle) => (
                  <article className="sc-cycle" key={cycle.name}>
                    <h3>{cycle.name}</h3>
                    {cycle.description && <p>{cycle.description}</p>}
                    <div className="sc-chips">
                      {cycle.levels.map((level) => (
                        <span className="sc-chip" key={level}>
                          {level}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Gallery ---------- */}
        {data.photos.length > 0 && (
          <section className="sc-section" id="vie-scolaire">
            <div className="sc-container">
              <div className="sc-section-head">
                <div className="sc-kicker">Vie scolaire</div>
                <h2>En images</h2>
              </div>
              <div className={`sc-gallery${data.photos.length >= 5 ? " featured" : ""}`}>
                {data.photos.slice(0, 9).map((photo, index) => (
                  <button
                    type="button"
                    key={photo.id}
                    onClick={() => setLightbox(index)}
                    aria-label={`Agrandir ${photo.caption || `la photo ${index + 1}`}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={api.mediaUrl(photo.url) || ""} alt={photo.caption || ""} loading="lazy" />
                    {photo.caption && <figcaption>{photo.caption}</figcaption>}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- News ---------- */}
        <section className={`sc-section${data.photos.length > 0 ? " sc-section-alt" : ""}`} id="actualites">
          <div className="sc-container">
            <div className="sc-section-head">
              <div className="sc-kicker">Actualités</div>
              <h2>La vie de l&apos;établissement</h2>
            </div>
            {data.announcements.length === 0 ? (
              <div className="card">
                <div className="state">
                  <span className="state-icon" aria-hidden="true">📰</span>
                  <div className="state-title">Aucune actualité publiée pour le moment</div>
                </div>
              </div>
            ) : (
              <div className="sc-news">
                {data.announcements.slice(0, 6).map((a) => {
                  const image = api.mediaUrl(a.imageUrl);
                  const long = a.content.length > 180;
                  const open = expanded[a.id];
                  return (
                    <article className="sc-news-card" key={a.id}>
                      <div className={`sc-news-media${image ? "" : " is-placeholder"}`} aria-hidden={!image}>
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="sc-news-body">
                        <time className="sc-news-date" dateTime={a.publishedAt}>
                          {formatDay(a.publishedAt)}
                        </time>
                        <h3>{a.title}</h3>
                        <p>{long && !open ? `${a.content.slice(0, 180).trimEnd()}…` : a.content}</p>
                        {long && (
                          <button
                            type="button"
                            className="sc-link-btn"
                            aria-expanded={!!open}
                            onClick={() => setExpanded((e) => ({ ...e, [a.id]: !open }))}
                          >
                            {open ? "Réduire" : "Lire la suite →"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ---------- Testimonials ---------- */}
        {data.testimonials.length > 0 && (
          <section className="sc-section" id="temoignages">
            <div className="sc-container">
              <div className="sc-section-head center">
                <div className="sc-kicker">Témoignages</div>
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

        {/* ---------- Admissions ---------- */}
        <section className="sc-section sc-section-alt" id="admissions">
          <div className="sc-container">
            <div className="sc-section-head">
              <div className="sc-kicker">Admissions</div>
              <h2>Rejoindre l&apos;établissement</h2>
              <p>Les candidatures se font en ligne. Voici les étapes jusqu&apos;à l&apos;inscription.</p>
            </div>
            <ol className="sc-steps" style={{ listStyle: "none" }}>
              {ADMISSION_STEPS.map((step) => (
                <li className="sc-step" key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="sc-cta-band">
              <KidsOnTheWay className="sc-cta-art" />
              <div className="sc-cta-text">
                <h3>Candidatures {data.academicYear ? data.academicYear : "ouvertes"}</h3>
                <p>Le formulaire prend quelques minutes, sans création de compte.</p>
              </div>
              <Link href={inscriptionHref} className="btn sc-btn-light sc-btn-lg">
                Déposer une candidature →
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- Partners ---------- */}
        {data.partners.length > 0 && (
          <section className="sc-section" id="partenaires">
            <div className="sc-container">
              <div className="sc-section-head center">
                <div className="sc-kicker">Partenaires</div>
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
        <section className={`sc-section${data.partners.length > 0 ? " sc-section-alt" : ""}`} id="contact">
          <div className="sc-container">
            <div className="sc-section-head">
              <div className="sc-kicker">Contact</div>
              <h2>Nous contacter</h2>
              <p>Le secrétariat répond à vos questions sur les inscriptions, la scolarité et la vie de l&apos;établissement.</p>
            </div>
            <div className="sc-contact">
              {location && (
                <div className="sc-contact-card">
                  <span className="sc-contact-icon" aria-hidden="true">📍</span>
                  <div>
                    <strong>Adresse</strong>
                    <span>{location}</span>
                    {data.mapUrl && (
                      <div style={{ marginTop: 6 }}>
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
                  <span className="sc-contact-icon" aria-hidden="true">📞</span>
                  <div>
                    <strong>Téléphone</strong>
                    <span>{data.phone}</span>
                  </div>
                </a>
              )}
              {data.whatsappNumber && (
                <a className="sc-contact-card" href={whatsappLink(data.whatsappNumber)} target="_blank" rel="noopener noreferrer">
                  <span className="sc-contact-icon" aria-hidden="true">💬</span>
                  <div>
                    <strong>WhatsApp</strong>
                    <span>{data.whatsappNumber}</span>
                  </div>
                </a>
              )}
              <a className="sc-contact-card" href={`mailto:${data.email}`}>
                <span className="sc-contact-icon" aria-hidden="true">✉️</span>
                <div>
                  <strong>E-mail</strong>
                  <span>{data.email}</span>
                </div>
              </a>
            </div>
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

      {/* ---------- Lightbox ---------- */}
      {lightbox !== null && data.photos[lightbox] && (
        <div className="sc-lightbox" role="dialog" aria-modal="true" aria-label="Galerie photo" onClick={() => setLightbox(null)}>
          <button type="button" className="sc-lightbox-close" aria-label="Fermer" onClick={() => setLightbox(null)}>
            ✕
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
                ‹
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
                ›
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
