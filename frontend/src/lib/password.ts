/** Client-side mirror of the server password policy (the server stays the authority). */
export const PASSWORD_HINT = "10 caractères minimum, avec au moins une lettre et un chiffre.";

export function passwordIssue(password: string): string | null {
  if (password.length < 10) return "Mot de passe trop court : 10 caractères minimum";
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return "Ajoutez au moins une lettre et un chiffre";
  return null;
}
