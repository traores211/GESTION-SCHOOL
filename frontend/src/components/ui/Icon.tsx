/**
 * Small, consistent SVG icon set (stroke icons, 20px). Used for navigation and compact
 * actions only — never decoratively in front of every button (see uix-pro skill).
 */
const PATHS: Record<string, string> = {
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z",
  students: "M12 3l9 5-9 5-9-5 9-5zM5 10.5V16c2 2 4.5 3 7 3s5-1 7-3v-5.5",
  parents: "M8 11a3 3 0 100-6 3 3 0 000 6zM16 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 6 1.5 6 4.5",
  staff: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  classes: "M3 21V9l9-6 9 6v12M9 21v-6h6v6",
  admissions: "M9 4h6l1 2h3v15H5V6h3zM9 12h6M9 16h4",
  attendance: "M5 12l4 4 10-10",
  grades: "M4 19V5M4 19h16M8 15l3-4 3 2 5-6",
  billing: "M3 7h18v10H3zM3 11h18M7 15h3",
  transport: "M5 16V6a2 2 0 012-2h10a2 2 0 012 2v10M3 16h18v2H3zM7 19v2M17 19v2M5 10h14",
  payroll: "M12 3v18M16 7c0-2-2-3-4-3s-4 1-4 3 2 3 4 3.5 4 1.5 4 3.5-2 3-4 3-4-1-4-3",
  announcements: "M4 10v4l12 5V5L4 10zM16 9a3 3 0 010 6",
  portal: "M12 12a4 4 0 100-8 4 4 0 000 8zM6 21v-1a6 6 0 0112 0v1",
  timetable: "M4 5h16v15H4zM4 10h16M9 5v15M8 3v4M16 3v4",
  documents: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  assistant: "M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1-2 3.4-.2-.1a1.7 1.7 0 00-1.9.1 1.7 1.7 0 00-.8 1.5V22H9v-.2a1.7 1.7 0 00-.8-1.5 1.7 1.7 0 00-1.9-.1l-.2.1-2-3.4.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H2v-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1 2-3.4.2.1a1.7 1.7 0 001.9-.1A1.7 1.7 0 008.2 2.2V2h5.6v.2a1.7 1.7 0 00.8 1.5 1.7 1.7 0 001.9.1l.2-.1 2 3.4-.1.1a1.7 1.7 0 00-.3 1.8 1.7 1.7 0 001.5 1h.2v4h-.2a1.7 1.7 0 00-1.5 1z",
  audit: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  platform: "M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  bell: "M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0",
  logout: "M15 17l5-5-5-5M20 12H9M12 20H5V4h7",
  close: "M6 6l12 12M18 6L6 18",
};

export default function Icon({ name, size = 20, label }: { name: keyof typeof PATHS | string; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name] ?? PATHS.more} />
    </svg>
  );
}
