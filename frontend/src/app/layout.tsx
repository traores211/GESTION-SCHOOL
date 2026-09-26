import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: { default: "GESTION SCHOOL", template: "%s — GESTION SCHOOL" },
  description: "Plateforme de gestion scolaire : scolarité, notes, présences, finances, documents et vitrine de l'établissement.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f5f4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
