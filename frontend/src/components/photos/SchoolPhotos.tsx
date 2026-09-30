"use client";

import { useRef, type ReactNode } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import "./photos.css";

/*
 * Vraies photos d'élèves et d'enseignants (page d'accueil, vitrine des écoles, connexion).
 * Les fichiers sont dans public/images/ecole (WebP, crédits dans CREDITS.md).
 * Charte : orange / blanc / vert du drapeau ivoirien (drapeau derrière le collage, anneaux tricolores).
 * Animations : entrée échelonnée, léger parallaxe au scroll, pastilles flottantes.
 * Tout est coupé quand l'utilisateur demande « réduire les animations ».
 */

export const PHOTOS = {
  elevePupitre: { src: "/images/ecole/eleve-pupitre.webp", alt: "Un élève souriant à son pupitre, stylo à la main" },
  elevesUniformes: { src: "/images/ecole/eleves-uniformes.webp", alt: "Des écolières en uniforme vert et jaune qui sourient" },
  camarades: { src: "/images/ecole/camarades.webp", alt: "Deux camarades en uniforme, cartable sur le dos" },
  enseignanteLecture: { src: "/images/ecole/enseignante-lecture.webp", alt: "Une enseignante fait la lecture devant sa classe" },
  enseignantTableau: { src: "/images/ecole/enseignant-tableau.webp", alt: "Un enseignant explique la leçon à ses élèves" },
  salleDeClasse: { src: "/images/ecole/salle-de-classe.webp", alt: "Une salle de classe remplie d'élèves attentifs" },
  ecriture: { src: "/images/ecole/ecriture.webp", alt: "Des élèves écrivent dans leurs cahiers" },
  fenetre: { src: "/images/ecole/fenetre.webp", alt: "Des enfants rieurs à la fenêtre de l'école" },
  eleveSac: { src: "/images/ecole/eleve-sac.webp", alt: "Un élève avec son cartable, prêt pour la classe" },
} as const;

export type PhotoKey = keyof typeof PHOTOS;

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- Apparition au scroll ---------- */

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Photo cadrée (zoom lent + apparition) ---------- */

export function Photo({
  name,
  alt,
  sizes = "(max-width: 960px) 100vw, 50vw",
  priority,
  className,
  kenBurns,
}: {
  name: PhotoKey;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  kenBurns?: boolean;
}) {
  const p = PHOTOS[name];
  return (
    <div className={`ph${kenBurns ? " ph-kenburns" : ""}${className ? ` ${className}` : ""}`}>
      <Image src={p.src} alt={alt ?? p.alt} fill sizes={sizes} priority={priority} />
    </div>
  );
}

/* ---------- Collage du bandeau d'accueil ---------- */

const pop: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 30 },
  show: (i: number) => ({ opacity: 1, scale: 1, y: 0, transition: { duration: 0.8, delay: 0.15 + i * 0.18, ease: EASE } }),
};

export function HeroCollage({ caption }: { caption?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Les vignettes glissent à des vitesses différentes : effet de profondeur.
  const ySlow = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -40]);
  const yFast = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -90]);
  const initial = reduce ? false : "hidden";

  return (
    <div className="ph-collage" ref={ref} role="img" aria-label={caption ?? "Des élèves et une enseignante en classe"}>
      <motion.div className="ph-flag" aria-hidden="true" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease: EASE }} />
      <span className="ph-sun" aria-hidden="true" />
      <motion.div className="ph-collage-main" variants={pop} custom={0} initial={initial} animate="show" style={{ y: ySlow }}>
        <Photo name="elevePupitre" alt="" priority kenBurns sizes="(max-width: 960px) 90vw, 440px" />
      </motion.div>

      <motion.div className="ph-collage-side top" variants={pop} custom={1} initial={initial} animate="show" style={{ y: yFast }}>
        <div className="ph-float ph-ring">
          <Photo name="elevesUniformes" alt="" sizes="220px" />
        </div>
      </motion.div>

      <motion.div className="ph-collage-side bottom" variants={pop} custom={2} initial={initial} animate="show" style={{ y: yFast }}>
        <div className="ph-float ph-float-late">
          <Photo name="enseignanteLecture" alt="" sizes="240px" />
        </div>
      </motion.div>

      <motion.div className="ph-chip ph-chip-a" variants={pop} custom={3} initial={initial} animate="show">
        <span className="ph-chip-dot" aria-hidden="true" />
        Appel du matin : 32/32 présents
      </motion.div>
      <motion.div className="ph-chip ph-chip-b" variants={pop} custom={4} initial={initial} animate="show">
        <strong>15,5</strong>
        <span>Moyenne du trimestre</span>
      </motion.div>
    </div>
  );
}

/* ---------- Carte « profil » avec photo (élèves / enseignants / parents) ---------- */

export function PersonaCard({
  photo,
  title,
  text,
  action,
  index = 0,
}: {
  photo: PhotoKey;
  title: string;
  text: string;
  action?: ReactNode;
  index?: number;
}) {
  return (
    <Reveal delay={index * 0.12}>
      <article className="ph-persona">
        <div className="ph-persona-media">
          <Photo name={photo} sizes="(max-width: 960px) 100vw, 360px" />
        </div>
        <div className="ph-persona-body">
          <h3>{title}</h3>
          <p>{text}</p>
          {action}
        </div>
      </article>
    </Reveal>
  );
}

/* ---------- Photo ronde du bandeau d'inscription ---------- */

export function CtaPortrait({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`ph-cta${className ? ` ${className}` : ""}`}
      initial={reduce ? false : { opacity: 0, rotate: -8, scale: 0.8 }}
      whileInView={{ opacity: 1, rotate: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.8, ease: EASE }}
      aria-hidden="true"
    >
      <div className="ph-ring">
        <Photo name="camarades" alt="" sizes="150px" />
      </div>
    </motion.div>
  );
}
