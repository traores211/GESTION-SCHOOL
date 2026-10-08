import Link from "next/link";
import { BrandMark, FlagBand } from "../../components/Brand";
import "./privacy.css";

export const metadata = {
  title: "Protection des données personnelles",
  description: "Quelles données l'établissement conserve, pourquoi, combien de temps, et comment exercer vos droits.",
};

/** Public privacy notice, linked from the sign-in page, the application form and the school showcase. */
export default function PrivacyNoticePage() {
  return (
    <main className="privacy">
      <FlagBand />
      <article className="privacy-doc">
        <header>
          <Link href="/login" className="privacy-brand">
            <BrandMark size={24} />
            <strong>School ERP</strong>
          </Link>
          <h1>Protection des données personnelles</h1>
          <p className="privacy-lead">
            Cette page explique quelles informations l&apos;établissement scolaire conserve sur les élèves et leurs familles, à quoi elles servent, combien de temps elles sont gardées et comment exercer vos droits. Elle s&apos;applique conformément à la loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel.
          </p>
        </header>

        <section>
          <h2>Qui est responsable de vos données ?</h2>
          <p>
            L&apos;établissement scolaire où l&apos;élève est inscrit ou candidat est le responsable du traitement. School ERP est l&apos;outil qu&apos;il utilise pour sa gestion ; l&apos;éditeur du logiciel agit pour le compte de l&apos;établissement et n&apos;utilise pas vos données pour son propre compte.
          </p>
        </section>

        <section>
          <h2>Quelles données sont conservées ?</h2>
          <ul>
            <li>
              <strong>Élève</strong> : identité, date et lieu de naissance, classe, présences, notes et bulletins, dossier d&apos;admission et pièces fournies.
            </li>
            <li>
              <strong>Santé</strong> : allergies et besoins particuliers, uniquement s&apos;ils ont été communiqués par la famille. Ces informations sont chiffrées dans la base de données.
            </li>
            <li>
              <strong>Responsables légaux</strong> : identité, lien de parenté, téléphone, adresse e-mail, profession et adresse si elles ont été fournies.
            </li>
            <li>
              <strong>Scolarité</strong> : factures, paiements et moyen de paiement utilisé. Aucun numéro de carte bancaire ni code Mobile Money n&apos;est enregistré par l&apos;établissement.
            </li>
            <li>
              <strong>Compte en ligne</strong> : adresse e-mail, mot de passe (stocké sous forme d&apos;empreinte illisible), dates de connexion.
            </li>
          </ul>
        </section>

        <section>
          <h2>À quoi servent-elles ?</h2>
          <ul>
            <li>Étudier une candidature et inscrire l&apos;élève.</li>
            <li>Assurer le suivi scolaire : appel, notes, bulletins, emploi du temps.</li>
            <li>Informer la famille : absences, convocations, reçus de paiement, relances.</li>
            <li>Tenir la comptabilité de l&apos;établissement, comme la loi l&apos;exige.</li>
          </ul>
          <p>Elles ne sont ni vendues, ni utilisées pour de la publicité.</p>
        </section>

        <section>
          <h2>Qui y a accès ?</h2>
          <p>
            Seul le personnel de l&apos;établissement, selon sa fonction : un enseignant voit ses classes, le comptable voit la facturation, la direction voit l&apos;ensemble. Chaque modification est tracée dans un journal consultable par la direction. Un parent ne voit que les informations de ses propres enfants.
          </p>
        </section>

        <section>
          <h2>Combien de temps sont-elles gardées ?</h2>
          <p>
            Pendant toute la scolarité de l&apos;élève, puis pendant la durée de conservation fixée par l&apos;établissement (cinq ans par défaut après son départ). Passé ce délai, le dossier est anonymisé : l&apos;identité de l&apos;élève et de ses responsables est effacée ; seuls restent des résultats et des écritures comptables qui ne peuvent plus être rattachés à une personne.
          </p>
        </section>

        <section>
          <h2>Les messages SMS et WhatsApp</h2>
          <p>
            L&apos;établissement peut envoyer des SMS aux responsables (absence, paiement reçu, convocation, relance). Vous pouvez refuser ces messages à tout moment en le signalant au secrétariat : aucun message ne vous sera plus envoyé.
          </p>
        </section>

        <section>
          <h2>Vos droits</h2>
          <ul>
            <li>
              <strong>Accès</strong> : obtenir une copie de toutes les données conservées sur votre enfant et sur vous.
            </li>
            <li>
              <strong>Rectification</strong> : faire corriger une information inexacte.
            </li>
            <li>
              <strong>Effacement</strong> : demander l&apos;anonymisation du dossier après le départ de l&apos;élève, sous réserve des obligations légales de conservation (comptabilité, diplômes).
            </li>
            <li>
              <strong>Opposition</strong> : refuser les messages qui ne sont pas indispensables à la scolarité.
            </li>
          </ul>
          <p>
            Pour exercer ces droits, adressez-vous au secrétariat ou à la direction de l&apos;établissement, qui vous répondra dans un délai d&apos;un mois. En cas de difficulté, vous pouvez saisir l&apos;Autorité de protection des données de Côte d&apos;Ivoire (ARTCI).
          </p>
        </section>

        <section>
          <h2>Sécurité</h2>
          <p>
            Connexions chiffrées (HTTPS), mots de passe robustes et double authentification pour les fonctions sensibles, données de santé chiffrées, sauvegardes quotidiennes chiffrées, séparation stricte des données entre établissements.
          </p>
        </section>

        <footer>
          <Link href="/login">Retour à la connexion</Link>
        </footer>
      </article>
    </main>
  );
}
