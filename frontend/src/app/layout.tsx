import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { FeedbackProvider } from "../components/ui/Feedback";
import ErrorReporter from "../components/ErrorReporter";
import ServiceWorker from "../components/ServiceWorker";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const serif = Source_Serif_4({ subsets: ["latin"], display: "swap", variable: "--font-serif-face", axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "School ERP", template: "%s · School ERP" },
  description: "Gestion scolaire — élèves, emplois du temps, notes, présence, facturation",
  // Installable on phones and computers (public/manifest.webmanifest, public/sw.js).
  manifest: "/manifest.webmanifest",
  applicationName: "School ERP",
  appleWebApp: { capable: true, title: "School ERP", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1916" },
  ],
};

/** Applies the stored theme before first paint, so a dark-mode user never sees a flash of white. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ErrorReporter />
        <ServiceWorker />
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
