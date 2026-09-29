import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { FeedbackProvider } from "../components/ui/Feedback";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "School ERP", template: "%s · School ERP" },
  description: "Gestion scolaire — élèves, emplois du temps, notes, présence, facturation",
};

export const viewport: Viewport = {
  themeColor: "#0b3d27",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
