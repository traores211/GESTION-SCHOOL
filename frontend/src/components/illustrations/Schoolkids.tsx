"use client";

import { useId } from "react";

/*
 * Illustrations vectorielles d'écoliers (page d'accueil + vitrine des écoles).
 * Tout est en SVG inline : net à toutes les tailles, aucun fichier binaire, et les couleurs
 * reprennent la charte (vert / orange / blanc de la Côte d'Ivoire, cf. globals.css).
 */

const INK = "#1b1310";

type Hair = "short" | "afro" | "puffs" | "braids";
type Pose = "down" | "wave" | "book" | "cheer";

type KidProps = {
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
  skin: string;
  shirt: string;
  bottom: string;
  skirt?: boolean;
  hair: Hair;
  pose: Pose;
  backpack?: string;
  accent?: string; // rubans, perles, couverture du livre
};

type Pt = [number, number];

// Bras : peau de l'épaule à la main, manche courte par-dessus, main ronde.
function Arm({ shoulder, elbow, hand, skin, shirt }: { shoulder: Pt; elbow: Pt; hand: Pt; skin: string; shirt: string }) {
  const mid: Pt = [(shoulder[0] + elbow[0]) / 2, (shoulder[1] + elbow[1]) / 2];
  return (
    <>
      <path
        d={`M${shoulder[0]} ${shoulder[1]} L${elbow[0]} ${elbow[1]} L${hand[0]} ${hand[1]}`}
        fill="none"
        stroke={skin}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={`M${shoulder[0]} ${shoulder[1]} L${mid[0]} ${mid[1]}`} stroke={shirt} strokeWidth={15} strokeLinecap="round" />
    </>
  );
}

function Hand({ at, skin }: { at: Pt; skin: string }) {
  return <circle cx={at[0]} cy={at[1]} r={6.5} fill={skin} />;
}

function HairBack({ hair, accent }: { hair: Hair; accent: string }) {
  if (hair === "puffs") {
    return (
      <>
        <circle cx={-27} cy={-190} r={15} fill={INK} />
        <circle cx={27} cy={-190} r={15} fill={INK} />
        {/* rubans */}
        <path d="M-20 -181 l-9 -6 v12 z M-20 -181 l9 -6 v12 z" fill={accent} />
        <path d="M20 -181 l-9 -6 v12 z M20 -181 l9 -6 v12 z" fill={accent} />
      </>
    );
  }
  if (hair === "braids") {
    const beads = [-150, -140, -130];
    return (
      <>
        {[-1, 1].map((side) => (
          <g key={side}>
            {[-176, -166, -156].map((cy) => (
              <circle key={cy} cx={side * 27} cy={cy} r={6} fill={INK} />
            ))}
            {beads.map((cy, i) => (
              <circle key={cy} cx={side * 28} cy={cy} r={4.5} fill={i % 2 ? "#fff" : accent} />
            ))}
          </g>
        ))}
      </>
    );
  }
  return null;
}

function HairFront({ hair }: { hair: Hair }) {
  if (hair === "afro") {
    const bumps = Array.from({ length: 11 }, (_, i) => {
      const a = Math.PI * (1.05 + (i / 10) * 0.9);
      return <circle key={i} cx={Math.cos(a) * 28} cy={-164 + Math.sin(a) * 28} r={9} fill={INK} />;
    });
    return (
      <>
        {bumps}
        <path d="M-30 -163 C-30 -184 -16 -191 0 -191 C16 -191 30 -184 30 -163 C25 -173 14 -177 0 -177 C-14 -177 -25 -173 -30 -163Z" fill={INK} />
      </>
    );
  }
  if (hair === "short") {
    return <path d="M-30 -164 C-31 -186 -17 -194 0 -194 C17 -194 31 -186 30 -164 C26 -174 16 -179 0 -179 C-16 -179 -26 -174 -30 -164Z" fill={INK} />;
  }
  // puffs et tresses : raie au milieu
  return (
    <>
      <path d="M-30 -160 C-32 -186 -16 -195 0 -195 C16 -195 32 -186 30 -160 C27 -176 14 -182 0 -182 C-14 -182 -27 -176 -30 -160Z" fill={INK} />
      <path d="M0 -194 V-182" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
    </>
  );
}

export function Kid({ x, y, scale = 1, flip, skin, shirt, bottom, skirt, hair, pose, backpack, accent = "#f77f00" }: KidProps) {
  const L: Pt = [-25, -120];
  const R: Pt = [25, -120];
  const downElbow = (s: number): Pt => [s * 31, -96];
  const downHand = (s: number): Pt => [s * 32, -72];

  let left = { elbow: downElbow(-1), hand: downHand(-1) };
  let right = { elbow: downElbow(1), hand: downHand(1) };
  if (pose === "book") {
    left = { elbow: [-32, -100], hand: [-21, -93] };
    right = { elbow: [32, -100], hand: [21, -93] };
  } else if (pose === "cheer") {
    left = { elbow: [-44, -136], hand: [-50, -164] };
    right = { elbow: [44, -136], hand: [50, -164] };
  }
  const waving = pose === "wave";

  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <ellipse cx={0} cy={0} rx={36} ry={6} fill="rgba(0,0,0,0.16)" />

      {backpack && <rect x={-35} y={-124} width={70} height={60} rx={15} fill={backpack} />}

      {/* jambes, chaussettes, chaussures */}
      <rect x={-17} y={-46} width={11} height={38} rx={5} fill={skin} />
      <rect x={6} y={-46} width={11} height={38} rx={5} fill={skin} />
      <rect x={-17} y={-17} width={11} height={9} fill="#fff" />
      <rect x={6} y={-17} width={11} height={9} fill="#fff" />
      <rect x={-22} y={-10} width={18} height={10} rx={5} fill="#2a2522" />
      <rect x={4} y={-10} width={18} height={10} rx={5} fill="#2a2522" />

      {skirt ? (
        <>
          <path d="M-24 -70 H24 L34 -36 H-34 Z" fill={bottom} />
          <path d="M-8 -68 L-12 -37 M0 -68 V-37 M8 -68 L12 -37" stroke="rgba(0,0,0,0.18)" strokeWidth={1.5} />
        </>
      ) : (
        <path d="M-26 -70 H26 L27 -40 H4 L0 -54 L-4 -40 H-27 Z" fill={bottom} />
      )}

      {/* cou + chemise d'uniforme */}
      <rect x={-7} y={-140} width={14} height={14} rx={4} fill={skin} />
      <path d="M-24 -128 Q0 -134 24 -128 Q31 -125 31 -112 L27 -66 H-27 L-31 -112 Q-31 -125 -24 -128 Z" fill={shirt} />
      <path d="M-13 -130 L-1 -129 L-5 -117 Z M13 -130 L1 -129 L5 -117 Z" fill="#fff" stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
      {[-110, -98, -86].map((cy) => (
        <circle key={cy} cx={0} cy={cy} r={1.7} fill="rgba(0,0,0,0.28)" />
      ))}
      <rect x={9} y={-113} width={11} height={11} rx={2} fill="rgba(0,0,0,0.08)" />
      {backpack && (
        <path d="M-17 -129 L-15 -80 M17 -129 L15 -80" stroke={backpack} strokeWidth={6} strokeLinecap="round" />
      )}

      {/* bras */}
      <Arm shoulder={L} elbow={left.elbow} hand={left.hand} skin={skin} shirt={shirt} />
      {waving ? (
        <g className="ill-wave">
          <Arm shoulder={R} elbow={[46, -132]} hand={[54, -160]} skin={skin} shirt={shirt} />
          <Hand at={[54, -160]} skin={skin} />
          <path d="M66 -170 q5 6 0 12 M72 -176 q8 10 0 22" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      ) : (
        <Arm shoulder={R} elbow={right.elbow} hand={right.hand} skin={skin} shirt={shirt} />
      )}
      {pose === "book" && (
        <g>
          <rect x={-22} y={-116} width={44} height={30} rx={3} fill={accent} />
          <rect x={-19} y={-113} width={38} height={24} rx={2} fill="#fff" opacity={0.25} />
          <path d="M0 -116 V-86" stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
          <text x={-10} y={-96} fontSize={11} fontWeight={800} fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">
            ABC
          </text>
        </g>
      )}
      <Hand at={left.hand} skin={skin} />
      {!waving && <Hand at={right.hand} skin={skin} />}

      {/* tête */}
      <HairBack hair={hair} accent={accent} />
      <circle cx={-29} cy={-160} r={6} fill={skin} />
      <circle cx={29} cy={-160} r={6} fill={skin} />
      <circle cx={0} cy={-162} r={30} fill={skin} />
      <HairFront hair={hair} />
      <path d="M-15 -172 Q-10 -175 -5 -172 M5 -172 Q10 -175 15 -172" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <ellipse cx={-10} cy={-162} rx={3.4} ry={4.2} fill={INK} />
      <ellipse cx={10} cy={-162} rx={3.4} ry={4.2} fill={INK} />
      <circle cx={-9} cy={-163.5} r={1.1} fill="#fff" />
      <circle cx={11} cy={-163.5} r={1.1} fill="#fff" />
      <path d="M-3 -155 Q0 -152 3 -155" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={-18} cy={-151} r={5} fill="#ff7a6b" opacity={0.3} />
      <circle cx={18} cy={-151} r={5} fill="#ff7a6b" opacity={0.3} />
      <path d="M-9 -149 Q0 -137 9 -149 Q0 -146 -9 -149 Z" fill="#6b1f1f" />
      <path d="M-7 -148.4 Q0 -146 7 -148.4 L6 -146.8 Q0 -144.8 -6 -146.8 Z" fill="#fff" />
    </g>
  );
}

// ---------------------------------------------------------------- décors

function Star({ x, y, r = 8, fill = "#ffd166" }: { x: number; y: number; r?: number; fill?: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} />;
}

function Pencil({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x={0} y={-7} width={62} height={14} rx={2} fill="#ffc233" />
      <rect x={0} y={-7} width={62} height={4} fill="#ffd97a" />
      <rect x={-12} y={-7} width={13} height={14} rx={3} fill="#f28b82" />
      <rect x={-1} y={-7} width={6} height={14} fill="#c9ccd1" />
      <path d="M62 -7 L80 0 L62 7 Z" fill="#f4d7b0" />
      <path d="M74 -2.3 L80 0 L74 2.3 Z" fill={INK} />
    </g>
  );
}

function OpenBook({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <path d="M0 4 Q-22 -6 -44 2 V34 Q-22 26 0 36 Z" fill="#fff" stroke="#00753a" strokeWidth={3} strokeLinejoin="round" />
      <path d="M0 4 Q22 -6 44 2 V34 Q22 26 0 36 Z" fill="#fff" stroke="#00753a" strokeWidth={3} strokeLinejoin="round" />
      <path d="M-36 12 Q-22 8 -8 13 M-36 20 Q-22 16 -8 21 M8 13 Q22 8 36 12 M8 21 Q22 16 36 20" stroke="#9fd5b7" strokeWidth={2} fill="none" />
    </g>
  );
}

function CiFlag({ x, y, h = 150 }: { x: number; y: number; h?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-2.5} y={-h} width={5} height={h} rx={2} fill="#8a9690" />
      <circle cx={0} cy={-h - 3} r={5} fill="#ffd166" />
      <g className="ill-flag">
        <rect x={2.5} y={-h + 4} width={20} height={36} fill="#f77f00" />
        <rect x={22.5} y={-h + 4} width={20} height={36} fill="#fff" />
        <rect x={42.5} y={-h + 4} width={20} height={36} fill="#00954a" />
      </g>
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-7 0 L-5 -70 Q0 -76 5 -70 L7 0 Z" fill="#8a5a33" />
      <path d="M-4 -52 L-24 -74 M3 -60 L22 -82" stroke="#8a5a33" strokeWidth={5} strokeLinecap="round" />
      <circle cx={-26} cy={-92} r={28} fill="#1f8f53" />
      <circle cx={24} cy={-98} r={30} fill="#1f8f53" />
      <circle cx={0} cy={-118} r={34} fill="#2fb36a" />
      <circle cx={-10} cy={-128} r={10} fill="#56c98a" opacity={0.7} />
    </g>
  );
}

function SchoolBuilding({ x, y }: { x: number; y: number }) {
  // (x, y) = milieu du bas du bâtiment
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-160} y={-150} width={320} height={150} fill="#fdf6ec" />
      <rect x={-160} y={-18} width={320} height={18} fill="#efe2cf" />
      <path d="M-182 -146 L0 -228 L182 -146 Z" fill="#f77f00" />
      <path d="M-182 -146 L182 -146 L170 -136 H-170 Z" fill="#d96e00" />
      <circle cx={0} cy={-176} r={16} fill="#fff" />
      <circle cx={0} cy={-176} r={12} fill="none" stroke="#00753a" strokeWidth={2} />
      <path d="M0 -184 V-176 L6 -172" stroke="#00753a" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      {[-130, -80, 50, 100].map((wx) => (
        <g key={wx}>
          <rect x={wx} y={-118} width={34} height={38} rx={3} fill="#bfe3ff" stroke="#00753a" strokeWidth={3} />
          <path d={`M${wx + 17} -118 V-80 M${wx} -99 H${wx + 34}`} stroke="#00753a" strokeWidth={2} />
          <rect x={wx - 3} y={-80} width={40} height={5} rx={2} fill="#efe2cf" />
        </g>
      ))}
      <rect x={-50} y={-140} width={100} height={20} rx={4} fill="#00753a" />
      <text x={0} y={-125.5} textAnchor="middle" fontSize={13} fontWeight={800} letterSpacing={2} fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">
        ÉCOLE
      </text>
      <path d="M-22 0 V-86 Q0 -104 22 -86 V0 Z" fill="#00954a" />
      <path d="M0 -99 V0" stroke="#00753a" strokeWidth={2} />
      <circle cx={-6} cy={-44} r={2.5} fill="#ffd166" />
      <circle cx={6} cy={-44} r={2.5} fill="#ffd166" />
    </g>
  );
}

// ---------------------------------------------------------------- scènes

type SceneProps = { className?: string; title?: string };

/** Grande scène du bandeau : quatre écoliers souriants devant leur école. */
export function SchoolkidsHero({ className, title = "Illustration : quatre écoliers souriants en uniforme devant leur école" }: SceneProps) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 600 500" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3df" />
          <stop offset="1" stopColor="#e5f4ec" />
        </linearGradient>
        <clipPath id={`${id}-arch`}>
          <path d="M70 470 V250 A230 230 0 0 1 530 250 V470 Z" />
        </clipPath>
      </defs>

      {/* fenêtre en arche : le décor */}
      <path d="M62 478 V250 A238 238 0 0 1 538 250 V478 Z" fill="rgba(255,255,255,0.14)" />
      <g clipPath={`url(#${id}-arch)`}>
        <rect x={0} y={0} width={600} height={500} fill={`url(#${id}-sky)`} />
        <circle cx={430} cy={120} r={44} fill="#ffc46b" />
        <circle cx={430} cy={120} r={62} fill="#ffc46b" opacity={0.25} />
        <path d="M110 108 q14 -16 32 -6 q18 -12 30 6 q14 2 10 14 h-78 q-8 -10 6 -14z" fill="#fff" />
        <path d="M290 78 q10 -12 24 -4 q14 -9 22 4 q11 2 8 11 h-60 q-6 -8 6 -11z" fill="#fff" opacity={0.9} />
        <Tree x={508} y={374} s={1} />
        <SchoolBuilding x={322} y={372} />
        <CiFlag x={110} y={378} h={200} />
        <path d="M0 368 Q150 354 300 366 T600 362 V500 H0 Z" fill="#8fd4a9" />
        <path d="M0 418 Q160 404 300 416 T600 410 V500 H0 Z" fill="#6cc491" />
        {/* allée qui mène à la porte */}
        <path d="M304 372 L340 372 L372 500 L272 500 Z" fill="#f3e3c7" opacity={0.85} />
      </g>

      <Kid x={170} y={462} scale={0.9} flip skin="#8d5524" shirt="#e8d29e" bottom="#7a5a26" hair="short" pose="wave" backpack="#f77f00" />
      <Kid x={252} y={472} scale={0.9} skin="#5c3418" shirt="#fbfbf7" bottom="#00753a" skirt hair="puffs" pose="book" accent="#1d5fbf" />
      <Kid x={358} y={470} scale={0.9} skin="#a0643a" shirt="#cfe6ff" bottom="#2a3f6b" hair="afro" pose="cheer" />
      <Kid x={440} y={462} scale={0.9} skin="#c68642" shirt="#fbfbf7" bottom="#2a3f6b" skirt hair="braids" pose="wave" backpack="#d64545" accent="#f77f00" />

      {/* éléments flottants */}
      <g className="ill-float">
        <Pencil x={30} y={196} rotate={-28} />
      </g>
      <g className="ill-float ill-delay">
        <OpenBook x={548} y={300} rotate={12} />
      </g>
      <Star x={58} y={330} r={9} />
      <Star x={562} y={176} r={11} />
      <Star x={540} y={420} r={7} fill="#fff" />
      <Star x={92} y={80} r={7} fill="#fff" />
      <text x={494} y={60} fontSize={26} fontWeight={800} fill="#ffd8ad" fontFamily="Segoe UI, Arial, sans-serif" transform="rotate(8 494 60)">
        A B C
      </text>
      <text x={8} y={430} fontSize={22} fontWeight={800} fill="#ffd8ad" fontFamily="Segoe UI, Arial, sans-serif" transform="rotate(-10 8 430)">
        1+2=3
      </text>
    </svg>
  );
}

/** Scène « en classe » : deux écoliers devant le tableau (encart « L'établissement »). */
export function ClassroomScene({ className, title = "Illustration : deux écoliers heureux en classe devant le tableau" }: SceneProps) {
  return (
    <svg viewBox="0 0 480 360" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect width={480} height={360} fill="#fff7ec" />
      <rect y={0} width={480} height={14} fill="#e5f4ec" />
      <rect y={280} width={480} height={80} fill="#e2c9a4" />
      <path d="M0 280 H480" stroke="#c9a97b" strokeWidth={4} />
      {[0, 60, 120, 180, 240, 300, 360, 420].map((px) => (
        <path key={px} d={`M${px} 284 V360`} stroke="#d4b78e" strokeWidth={2} />
      ))}

      {/* tableau noir */}
      <rect x={96} y={40} width={288} height={150} rx={6} fill="#8a5a33" />
      <rect x={106} y={50} width={268} height={130} rx={3} fill="#1f5f3f" />
      <text x={128} y={92} fontSize={26} fill="#fff" fontFamily="'Segoe Print', 'Comic Sans MS', cursive">
        Bonjour !
      </text>
      <text x={130} y={132} fontSize={20} fill="#ffd8ad" fontFamily="'Segoe Print', 'Comic Sans MS', cursive">
        2 + 3 = 5
      </text>
      <text x={272} y={132} fontSize={20} fill="#bfe3ff" fontFamily="'Segoe Print', 'Comic Sans MS', cursive">
        a b c
      </text>
      <Star x={338} y={80} r={12} fill="#ffd166" />
      <path d="M130 160 Q180 150 230 160" stroke="rgba(255,255,255,0.6)" strokeWidth={2} fill="none" />
      <rect x={300} y={184} width={40} height={6} rx={2} fill="#fff" />

      {/* globe + étagère */}
      <rect x={400} y={150} width={66} height={8} rx={2} fill="#8a5a33" />
      <g transform="translate(433 118)">
        <path d="M-14 32 H14 M0 24 V32" stroke="#8a9690" strokeWidth={4} strokeLinecap="round" />
        <circle cx={0} cy={0} r={24} fill="#6fb6ff" />
        <path d="M-14 -12 q10 -6 16 2 q-2 10 -12 8 z M4 6 q10 -4 12 6 q-6 8 -14 2 z" fill="#2fb36a" />
        <path d="M-27 -6 A28 28 0 0 0 20 22" stroke="#8a9690" strokeWidth={3} fill="none" />
      </g>
      {/* pile de livres */}
      <g transform="translate(40 280)">
        <rect x={0} y={-16} width={52} height={16} rx={2} fill="#f77f00" />
        <rect x={4} y={-30} width={46} height={14} rx={2} fill="#00954a" />
        <rect x={-2} y={-42} width={50} height={12} rx={2} fill="#1d5fbf" />
      </g>

      <Kid x={180} y={336} scale={0.88} skin="#6b3e1f" shirt="#e8d29e" bottom="#7a5a26" hair="short" pose="cheer" />
      <Kid x={300} y={340} scale={0.88} skin="#a0643a" shirt="#fbfbf7" bottom="#00753a" skirt hair="puffs" pose="book" accent="#f77f00" />
    </svg>
  );
}

/** Petite scène « en route pour l'école » (bandeau d'appel à candidater). */
export function KidsOnTheWay({ className, title = "Illustration : deux écoliers avec leur cartable, en route pour l'école" }: SceneProps) {
  return (
    <svg viewBox="0 0 220 190" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <circle cx={110} cy={104} r={84} fill="rgba(255,255,255,0.14)" />
      <Kid x={78} y={176} scale={0.74} flip skin="#8d5524" shirt="#cfe6ff" bottom="#2a3f6b" hair="afro" pose="wave" backpack="#f77f00" />
      <Kid x={148} y={178} scale={0.74} skin="#5c3418" shirt="#fbfbf7" bottom="#f77f00" skirt hair="braids" pose="down" backpack="#1d5fbf" accent="#00954a" />
      <Star x={24} y={40} r={8} />
      <Star x={196} y={52} r={6} fill="#fff" />
    </svg>
  );
}
