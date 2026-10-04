"use client";

import { useSyncExternalStore } from "react";

/**
 * Interface language. French is the source language: texts are written in French in the code and
 * looked up here for the other languages, so an untranslated text simply stays in French. To
 * translate a screen, wrap its texts in `t()` and add them to the dictionary below.
 */
export type Lang = "fr" | "en";
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

const EN: Record<string, string> = {
  // Navigation groups
  Pilotage: "Overview",
  Scolarité: "Schooling",
  Gestion: "Administration",
  Famille: "Family",
  // Navigation and page titles
  "Tableau de bord": "Dashboard",
  "Établissements": "Schools",
  "Établissement": "School",
  "Ouvert": "Open",
  "Synthèse & prévisions": "Summary & forecast",
  "Synthèse et prévisions": "Summary and forecast",
  "Emplois du temps": "Timetables",
  Élèves: "Pupils",
  Classes: "Classes",
  Présence: "Attendance",
  "Notes & bulletins": "Marks & report cards",
  "Conseil de classe": "Class council",
  "Cahier de textes": "Homework diary",
  "Vie scolaire": "School life",
  "Messages des parents": "Messages from parents",
  Admissions: "Admissions",
  Parents: "Parents",
  Personnel: "Staff",
  Facturation: "Billing",
  Paie: "Payroll",
  Transport: "Transport",
  "Imports Excel": "Excel imports",
  Imports: "Imports",
  "Messages aux familles": "Messages to families",
  "Annonces & vitrine": "Announcements & showcase",
  "Journal d'audit": "Audit journal",
  "Données personnelles": "Personal data",
  "Mes enfants": "My children",
  "Mon espace parent": "Parent portal",
  // Shell
  "Navigation principale": "Main navigation",
  "Aller au contenu": "Skip to content",
  "Ouvrir le menu": "Open the menu",
  "Menu du compte": "Account menu",
  "Sécurité du compte": "Account security",
  "Se déconnecter": "Sign out",
  "Chargement…": "Loading…",
  "Protégez votre compte.": "Protect your account.",
  "Votre rôle donne accès à des données sensibles : activez la double authentification.": "Your role gives access to sensitive data: turn on two-factor authentication.",
  "Activer maintenant": "Turn it on now",
  "Langue de l'interface": "Interface language",
  // Roles
  "Super Administrateur": "Super administrator",
  Administrateur: "Administrator",
  Directeur: "Head",
  Secrétaire: "Secretary",
  Comptable: "Accountant",
  Enseignant: "Teacher",
  Élève: "Pupil",
  Parent: "Parent",
  // Sign-in
  Connexion: "Sign in",
  "Gestion scolaire de votre établissement": "School management for your institution",
  "Adresse email": "Email address",
  "Mot de passe": "Password",
  "Se connecter": "Sign in",
  "Connexion…": "Signing in…",
  "Mot de passe oublié ?": "Forgot your password?",
  "Protection des données personnelles": "Personal data protection",
  "Code de vérification": "Verification code",
  "Afficher le mot de passe": "Show the password",
  "Masquer le mot de passe": "Hide the password",
};

const DICTIONARIES: Record<Lang, Record<string, string>> = { fr: {}, en: EN };
const STORAGE_KEY = "lang";
const listeners = new Set<() => void>();

export function getLang(): Lang {
  try {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // private browsing: the choice lasts for this page only
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((listener) => listener());
}

/** The text in the given language; the French source when there is no translation yet. */
export function translate(text: string, lang: Lang): string {
  return DICTIONARIES[lang][text] ?? text;
}

/** Number of French texts that have an English translation (shown nowhere; used by the tests). */
export const translatedCount = Object.keys(EN).length;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** `const { t, lang } = useI18n()` — re-renders the component when the language changes. */
export function useI18n() {
  // The server and the first client render are in French; the stored choice applies right after.
  const lang = useSyncExternalStore<Lang>(subscribe, getLang, () => "fr");
  return { lang, t: (text: string) => translate(text, lang) };
}
