# Benchmark concurrentiel — GESTION SCHOOL

> Date de la recherche : 26/09/2026. Sources publiques uniquement (sites marketing, pages de documentation, stores, annuaires d'avis). Aucune connexion, aucun formulaire soumis.
> Tous les contenus sont reformulés ; aucun texte ni visuel concurrent n'est reproduit.

**Légende de fiabilité**
- **[V]** = vérifié : lu directement sur une page officielle du produit à la date d'accès.
- **[S]** = source secondaire : annuaire, blog, article, store, moteur de recherche (non confirmé sur le site officiel).
- **[I]** = inféré : déduction raisonnable, à confirmer (démo, contact commercial).
- **?** = information introuvable publiquement.

---

## 1. Méthodologie et sources

**Démarche** : recherche web + lecture des pages publiques (accueil, fonctionnalités, tarifs, sécurité), relevé des pages de store/annuaires quand le site ne suffisait pas. Pour « Pilotage scolaire », récupération HTML brute de la landing et test des codes HTTP des liens publics.

**Limites** : pas d'accès aux démos ; les prix « sur devis » ne sont pas connus ; certains sites ont échoué au chargement (indiqué ci-dessous) ; la fonction de recherche web est centrée US, ce qui sous-représente les acteurs africains locaux.

| Produit | URL(s) consultée(s) (accès 26/09/2026) | Statut |
|---|---|---|
| Pilotage scolaire | https://pilotage.srv861861.hstgr.cloud (landing), `/parent/register`, `/admin/login`, `/teacher/login`, `/parent/login` | Landing + pages de connexion OK. `/pricing`, `/contact`, `/legal/privacy`, `/legal/terms`, `/legal/cookies` → **404** (liens présents mais pages non publiées) |
| KLASSCI | https://www.klassci.com/en, https://www.klassci.com/fr, https://www.klassci.com/fr/college, https://www.klassci.com/fr/securite, https://college.klassci.com/login | OK. Pas de page tarifs trouvée |
| SOKLE | Recherches « SOKLE gestion scolaire », « Sokle école », domaine sokle.com | **Introuvable** : aucun produit scolaire indexé ; sokle.com est un domaine parqué à vendre. Aucune fiche produite |
| IEMS | https://www.pwc.in/integrated-education-management-system-software.html, https://revolutionnext.com/iems-benefits, https://iems.com.pk/, Google Play `com.idlsys.iemschools` | Nom générique porté par **plusieurs éditeurs** (PwC Inde, RevolutionNext, IEMS Pakistan…). Page Play Store non lisible. Informations [S] seulement |
| SchoolERP | https://www.schoolerp.online/ | **Échec de chargement** (DNS / réponse vide) ; infos issues des extraits moteur [S] |
| SchoolDesk | https://www.schooldesk.cc/, https://www.schooldesk.cc/pricing/ | OK (prix non affichés) |
| Ed-admin | https://www.ed-admin.com/ | OK |
| SchoolTry | https://www.schooltry.com/ (contenu vide au rendu), https://k12.schooltry.com/, https://edtechimpact.com/products/schooltry/, App Store id1462863991 | Site officiel non lisible (rendu JS) ; infos [S] |
| Fedena | https://fedena.com/ ; https://fedena.com/pricing (**404**) ; annuaires Capterra/TrustRadius/Techjockey | Accueil OK ; prix via annuaires [S] |
| openSIS | https://www.opensis.com/ | OK |
| Classter | https://www.classter.com/ | OK |
| Novacole (ajout) | https://novacole.com/ | OK — concurrent direct Afrique de l'Ouest |
| EduCI (ajout) | https://www.educi.live/ | OK — concurrent direct Côte d'Ivoire |
| EducMaster (ajout) | https://educmaster.bj/, articles UNICEF / La Nation (Bénin) | OK — plateforme étatique, référence institutionnelle |
| Kinderpedia (ajout) | https://www.kinderpedia.co/ | OK |
| PRONOTE (référence francophone) | https://www.index-education.com/fr/logiciel-gestion-vie-scolaire.php | OK |
| Autres repérés, non analysés | Galactis (CI), KiboERP, Akademise (CM), Schoola (RDC), Sikolo (Gabon), Scolynx (Mali), Eduka Suite, EcoleDirecte, PowerSchool | Mentionnés pour mémoire ; non détaillés faute de temps/sources |

---

## 2. Fiches concurrents

### 2.1 Pilotage scolaire (https://pilotage.srv861861.hstgr.cloud)
- **Positionnement [V]** : « copilote » de suivi scolaire centré lien école–famille ; nouvelle plateforme annoncée pour la rentrée 2026 ; ciblage implicite Europe/France (RGPD enfants, hébergement souverain UE par défaut, notes /20, trimestres).
- **Portails [V]** : trois espaces séparés avec URL de connexion distinctes (admin, professeur, famille). Inscription autonome des familles (`/parent/register`) puis rattachement de l'enfant.
- **Académique [V]** : saisie des notes en grille optimisée clavier, brouillon → publication → révision historisée ; moyennes pondérées et tendances par matière recalculées en temps réel ; présences ; cahier de texte + ressources.
- **Emploi du temps [V]** : planning en glisser-déposer, export calendrier .ics pour les familles.
- **Différenciateur clé [V]** : alertes « explicables » (règle et variables citées + action recommandée), détection automatique des élèves à risque, règles d'alerte paramétrables par l'admin.
- **IA [V]** : refus affiché de l'« IA opaque » sur les données d'enfants — logique à base de règles transparentes.
- **Communication [V]** : annonces ciblées par audience, préférences de notification, digest ; notifications email à l'inscription. SMS/WhatsApp : ?
- **Personnalisation [V]** : marque blanche, champs personnalisés, rôles personnalisés, modèles de bulletins — « sans code » (revendiqué).
- **Mobile [V]** : PWA installable avec notifications natives, pas d'app store.
- **Sécurité [V]** (revendications, non auditées) : OWASP ASVS niveau 2, WCAG 2.2 AA, « ISO 27001 ready », MFA obligatoire admin/prof, chiffrement transit+repos, journal d'audit append-only, aucune comparaison nominative entre élèves ; politique de mot de passe ≥ 12 caractères observée sur le formulaire.
- **Finances / paie / transport / site public** : non mentionnés → **absents [I]** ; produit centré pédagogie + famille, pas ERP.
- **Tarifs** : lien « Tarifs » présent mais page en **404** → ?
- **Forces** : UX parent très soignée, transparence, accessibilité, sécurité mise en avant.
- **Limites** : produit très jeune (témoignage « école pilote »), pages légales/tarifs absentes, hébergement sur un sous-domaine d'hébergeur mutualisé (crédibilité), pas de volet financier ni mobile money → peu adapté à l'Afrique francophone en l'état.

### 2.2 KLASSCI (https://www.klassci.com)
- **Positionnement [V]** : SaaS éducatif « tout-en-un » né à Abidjan (Côte d'Ivoire), pour universités/grandes écoles, collèges/lycées et centres de formation.
- **Produits [V]** : KLASSCI Université (LMD, semestres, crédits, gouvernance, comptabilité), KLASSCI College (K-12), Classe virtuelle (LMS : cours, devoirs, évaluations).
- **Académique [V]** : notes, moyennes, rangs, bulletins PDF ; bulletins/rapports « prêts DREN » (conformité administrative ivoirienne) ; présences (absences, retards, justificatifs, statistiques de classe).
- **Emploi du temps [V]** : salles, enseignants mobiles, vues par rôle.
- **Finances [V]** : frais et caisse, reçus, soldes, relances. Mobile money : **non mentionné** sur les pages lues (?).
- **Documents [V]** : génération de certificats, attestations, relevés financiers.
- **Portails [V]** : parent (enfants, frais, documents, notes, EDT), élève, enseignant ; accès mobile parents/élèves.
- **Permissions [V]** : rôles personnalisables (pas de fonctions figées), séparation direction / secrétariat / comptabilité / enseignants / parents / élèves.
- **Inscription en ligne [V]** : portail d'inscription public (liste d'établissements ouverts aux inscriptions).
- **Intégration [V]** : documentation publique, référence API, changelog → maturité produit.
- **Sécurité [V]** (page très transparente) : instances dédiées par école hébergées chez LWS (France) ; sauvegardes nocturnes + hebdo complètes, rétention 30 j ; bcrypt ; MFA optionnelle par rôle ; audit avant/après ; cadre légal = loi ivoirienne 2013-450 (ARTCI) ; **aucune certification revendiquée** ; bases non chiffrées au niveau support (déclaré) ; export des données en tableur à la résiliation.
- **Tarifs** : ? (non publiés).
- **IA / SMS / WhatsApp / paie** : non mentionnés (?).
- **Forces** : ancrage local CI, couverture supérieur + secondaire, honnêteté sécurité, API.
- **Limites [I]** : pas de mobile money ni SMS affichés, prix opaques, hébergement hors Afrique.

### 2.3 SOKLE
- **Introuvable** : aucune occurrence d'un logiciel scolaire « SOKLE » dans les résultats ; le domaine sokle.com est parqué (à vendre). Possibles confusions : Sikolo (Gabon), Skolengo (France). **Aucune donnée présentée pour éviter toute invention.** Action : demander au commanditaire l'URL exacte.

### 2.4 IEMS (Integrated Education Management System)
- **Nom générique [S]** : au moins 3 éditeurs distincts (PwC Inde, RevolutionNext, IEMS Pakistan « e-Governance », app Android idlsys). Impossible d'attribuer les fonctionnalités à un seul produit.
- **Positionnement [S]** : suite intégrée écoles/collèges/universités, multi-campus avec identifiant unique, SaaS par abonnement.
- **IA [S]** : RevolutionNext se présente comme « AI enabled » (aide à la décision, reporting dynamique) — détail non vérifié.
- **Fonctions [S]** : suivi de performance, communications automatisées, reporting dynamique.
- **Tarifs / sécurité / mobile money** : ?
- **Pertinence** : faible pour l'Afrique francophone ; utile seulement comme illustration de l'argument « multi-campus + IA décisionnelle ».

### 2.5 SchoolERP (schoolerp.online, Inde)
- **Site officiel non chargé** (échec DNS/réponse vide) → infos [S] via extraits moteur.
- **Prix [S]** : ~5 INR / élève / mois (≈ 0,06 USD) — positionnement ultra low-cost.
- **Modules [S]** : « 50+ modules » ; portails admin, direction, comptable, enseignant, parent, élève ; EDT automatique classes/enseignants ; devoirs ; inventaire ; frais avec rappels et reçus ; WhatsApp mentionné comme canal.
- **Siège [S]** : Haryana, Inde.
- **Forces** : prix par élève très bas, nombreuses fonctions.
- **Limites [I]** : contexte indien (boards, INR), pas de français ni mobile money africain.

### 2.6 SchoolDesk (https://www.schooldesk.cc)
- **Positionnement [V]** : plateforme « tout-en-un » pour écoles privées haut de gamme, bureaux Royaume-Uni, Ghana, Ouganda, Liberia (Afrique anglophone).
- **Académique [V]** : bulletins avec remarques générées par IA, analyse d'examens repérant les élèves à risque, contrôle automatique des erreurs de bulletins.
- **Identité / sécurité physique [V]** : cartes et bracelets intelligents (entrées/sorties, porte-monnaie électronique), NFC visiteurs, biométrie (plan Premium).
- **Finances [V]** : facturation par trimestre, charges récurrentes, paiement en ligne **y compris mobile money**, relances automatiques, états comptables (balance, compte de résultat, bilan), boutique en ligne parents.
- **Paie [V]** : barèmes fiscaux intégrés, déclarations pension, bulletins de paie sur app.
- **Transport [V]** : suivi bus + notifications de montée/descente ; cantine sans espèces.
- **Offline [V]** : présences et paiements par carte fonctionnent sans internet puis synchronisent.
- **Permissions [V]** : rôles personnalisés (ex. surveillant, infirmière) avec droits fins.
- **Mobile [V]** : app Staff + app Guardian (iOS/Android).
- **Tarifs [V]** : 3 formules (Standard, Premium, Security), prix sur contact uniquement.
- **Sécurité [V]** : hébergement UE sous RGPD, chiffrement « niveau bancaire » (revendiqué).
- **Forces** : très complet, offline, hardware (cartes) = forte rétention. **Limites [I]** : anglophone, prix opaques, dépendance matériel.

### 2.7 Ed-admin (https://www.ed-admin.com)
- **Positionnement [V]** : « système d'exploitation » des écoles indépendantes premium ; 700+ écoles sur 3 continents, forte présence en Afrique du Sud, 25+ ans.
- **Modules [V]** : ~50 modules : admissions, dossiers élèves, évaluations, finances/économat, RH, communication, internat, emploi du temps.
- **Portails [V]** : parent, personnel, élève, alumni — quatre portails dans une seule app ; app parent incluse sans surcoût.
- **IA [V]** : « Ed-admin AI », assistant conversationnel intégré.
- **Architecture [V]** : base de données unique, cloud, navigateur.
- **Commercial [V]** : contrats annuels (pas d'engagement pluriannuel), support sans facturation à l'appel ; prix non publiés.
- **Sécurité** : peu d'éléments explicites (?).
- **Forces** : maturité, profondeur fonctionnelle, argument « anti-fragmentation ». **Limites [I]** : cible haut de gamme anglophone, coût probablement élevé, pas de français ni mobile money affichés.

### 2.8 SchoolTry (Nigeria)
- **Site officiel illisible** au rendu (application JS) → [S] (App Store, EdTech Impact, blogs nigérians).
- **Positionnement [S]** : plateforme web + mobile (iOS/Android) pour écoles K-12, déclinaison « Tertiary » pour le supérieur.
- **Académique [S]** : calcul des résultats, broadsheet, commentaires automatiques, notification de publication des résultats ; CBT (examens sur ordinateur) ; LMS / classe en ligne.
- **Communication [S]** : SMS + notifications push ; gestion de documents, congés, événements.
- **Tarifs [S]** : sur devis, démo gratuite. Fourchette marché Nigeria ~50 000–200 000 NGN/an (non spécifique SchoolTry).
- **Forces** : focus e-learning/CBT, apps natives. **Limites** : peu d'avis publics, anglophone.

### 2.9 Fedena (https://fedena.com)
- **Positionnement [V]** : ERP scolaire historique (Inde), revendique 40 000+ utilisateurs, 200+ pays, 20+ langues.
- **Modules [V]** : admissions avec vérification documentaire, présences, EDT, examens et bulletins, frais avec passerelles de paiement et pénalités de retard, RH/paie (congés, fiches de paie), messagerie parents-enseignants, 50+ modules additionnels.
- **Mobile [V]** : apps iOS/Android **en marque blanche** (parents, enseignants, élèves).
- **Multi-établissement [V]** : gestion de groupes scolaires.
- **Intégrations [V]** : visio (Meet, Zoom, BigBlueButton), biométrie, géolocalisation.
- **Tarifs [S]** : Standard ~999 USD/an, Pro Plus ~1 299 USD/an, sur mesure (annuaires ; page officielle /pricing en 404). Essai gratuit [S].
- **Historique [I]** : une ancienne version était open source (connu, non revérifié ici).
- **Forces** : exhaustivité, apps white-label. **Limites [I]** : UX datée selon avis courants, forfait fixe peu adapté aux petites écoles africaines.

### 2.10 openSIS (https://www.opensis.com)
- **Positionnement [V]** : SIS pour K-12, supérieur, formation pro, écoles virtuelles (origine US).
- **Modules [V]** : dossiers élèves, admissions, présences, EDT sans conflits, LMS, notes et relevés, facturation et paiements en ligne.
- **Mobile [V]** : app « Mobile Connect » iOS/Android (présences, notes, devoirs, EDT, facturation, paiement).
- **IA [V]** : recherche en langage naturel, analytique prédictive « agentique ».
- **Tarifs [V]** : modèle **par compte personnel** (pas par élève), mensuel ou annuel ; montants non affichés.
- **Conformité [V]** : ISO/IEC 27001:2022 certifié ; alignement FERPA, GDPR, COPPA.
- **Édition communautaire open source** : non mentionnée sur la page lue (existence historique connue [I]).
- **Forces** : certification sécurité réelle, IA analytique. **Limites [I]** : orientation US (FERPA, crédits), pas de mobile money.

### 2.11 Classter (https://www.classter.com)
- **Positionnement [V]** : « système d'exploitation » cloud tout-en-un, du K-12 au supérieur, académies, districts, formation corporate (éditeur grec, international [I]).
- **Modules [V]** : SIS, LMS, admissions, EDT, finance (facturation, paiements), RH, bibliothèque, transport, CRM académique, stages/mémoires, sondages/quiz, signature électronique, gestion de protocole.
- **Portails [V]** : parents, élèves, enseignants, employés, alumni, **agents** (recruteurs externes).
- **Intégrations [V]** : 40+ (Office 365, Moodle, Zoom, Teams, PayPal, DocuSign, HubSpot) + API REST.
- **Mobile [V]** : module mobile dédié.
- **Tarifs [V]** : sur devis, facturation annuelle ou biennale (jusqu'à -20 %).
- **Sécurité [V]** : hébergement Microsoft Azure + Azure Backup.
- **Forces** : très configurable, CRM admissions. **Limites [I]** : complexité, coût, pas d'ancrage africain.

### 2.12 Novacole (https://novacole.com) — ajout, concurrent direct
- **Positionnement [V]** : plateforme pensée « pour les réalités africaines » ; présente au Togo, Bénin, Burkina Faso, Mali, Niger, Côte d'Ivoire ; 160+ établissements, ~60 000 élèves revendiqués.
- **Académique [V]** : inscriptions, notes, présences, bulletins, **génération automatique d'EDT**.
- **Finances [V]** : paiements **Mobile Money intégrés** (Moov Money, Mixx by Yas), facturation, budget, FCFA.
- **RH/Paie [V]** : contrats, congés, salaires, déclarations sociales.
- **Communication [V]** : SMS, push, messagerie parents.
- **Nouveautés [V]** : assistant IA pour interroger les données, cantine, transport, quiz gamifiés.
- **Mobile [V]** : app Android (Play Store + APK), **mode hors ligne**.
- **Tarifs [V]** : par élève et par an — Basic 200 F CFA, Essentiel 400 F CFA, Complet 600 F CFA ; **essai 3 mois sans carte**.
- **Forces** : prix transparents très bas, mobile money réel, offline, multi-pays UEMOA. C'est **la référence prix du marché cible**.

### 2.13 EduCI (https://www.educi.live) — ajout, concurrent direct CI
- **Positionnement [V]** : gestion scolaire « intelligente » conçue en Côte d'Ivoire.
- **Fonctions [V]** : portails admin/enseignant/parent/élève, bulletins en un clic, EDT automatique avec détection de conflits, messagerie + push, SMS automatiques.
- **Paiements [V]** : Mobile Money Orange, MTN, Wave, Moov + carte + virement via l'agrégateur **Money Fusion** ; reçus automatiques, relances.
- **IA [V]** : assistant pédagogique (explications de leçons, quiz personnalisés, analyse de performance, recommandations).
- **Mobile [V]** : Android, iOS/iPad, web.
- **Tarifs [V]** : Starter 10 000 FCFA/mois (100 élèves), Standard 25 000 (500), Premium 50 000 (2 000), Entreprise sur devis.
- **Sécurité [V]** : TLS, sauvegardes quotidiennes, multi-tenant isolé, « conforme RGPD », 99,9 % (infrastructure Supabase).
- **Limites [I]** : jeune produit, preuves clients peu visibles ; paie non mise en avant.

### 2.14 EducMaster (Bénin) — ajout, référence institutionnelle
- **Nature [V/S]** : plateforme du ministère béninois, obligatoire pour collèges et lycées publics depuis 2018, extension soutenue par l'UNICEF.
- **Fonctions [S]** : immatriculation et suivi individuel des élèves, gestion des personnels, EDT des enseignants, présence au poste des agents, vie scolaire, résultats, statistiques nationales, lutte contre la fraude aux examens.
- **Enseignement** : les États standardisent les données → **l'interopérabilité/export vers les systèmes ministériels** (DREN/MENA en CI, EducMaster au Bénin) est un critère d'achat.

### 2.15 Kinderpedia (https://www.kinderpedia.co) — ajout
- **Cible [V]** : maternelles, crèches, primaire/secondaire, réseaux et franchises ; 40+ pays, 40+ langues (dont français, arabe).
- **Fonctions [V]** : 27+ modules — présences avec check-in QR, carnet de notes, fil quotidien et galerie photo/vidéo, visio et chat, facturation, gestion du personnel, documents.
- **Paiement [V]** : Stripe (carte) — pas de mobile money.
- **IA [V]** : « Kinderpedia AI » mentionné, sans détail.
- **Sécurité [V]** : AWS, profils de confidentialité par type d'utilisateur, conformité RGPD revendiquée.
- **Tarifs** : paliers, montants non affichés.
- **Intérêt** : modèle d'**engagement parent quotidien** (photos, journal) pour la maternelle — segment sous-servi en Afrique.

### 2.16 PRONOTE (Index Éducation) — référence francophone
- **Positionnement [V]** : lien sécurisé école–familles, standard de fait des collèges/lycées français ; déclinaisons Primaire et Campus.
- **Fonctions [V]** : notes, bulletins, cahier de textes, vie scolaire, communication ; EDT via le produit compagnon EDT ; apps mobiles.
- **Services [V]** : SMS, courrier postal (Maileva/La Poste), signature électronique — facturés à l'usage.
- **Sécurité [V]** : hébergement par l'éditeur, « opérateur souverain » ; éditeur certifié ISO 9001.
- **Intérêt** : fixe les **attentes des familles et enseignants francophones** (cahier de textes, vie scolaire, bulletins normalisés, appréciations).

---

## 3. Matrice fonctionnelle

Légende : ✅ présent (vérifié ou source fiable) · ⚠️ partiel / limité / seulement annoncé · ❌ absent ou non proposé · ? inconnu publiquement.
Abréviations : PIL = Pilotage scolaire, KLA = KLASSCI, NOV = Novacole, EDUCI = EduCI, SD = SchoolDesk, EDA = Ed-admin, ST = SchoolTry, FED = Fedena, OSIS = openSIS, CLA = Classter, KIN = Kinderpedia, PRO = PRONOTE, GS = GESTION SCHOOL (état actuel). SOKLE, IEMS et SchoolERP sont exclus de la matrice (introuvable / non attribuable / site non chargé).

| Fonctionnalité | PIL | KLA | NOV | EDUCI | SD | EDA | ST | FED | OSIS | CLA | KIN | PRO | **GS (actuel)** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dossiers élèves | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Parents / liens familiaux | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Classes / niveaux | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admissions / pré-inscription en ligne | ⚠️ (compte famille) | ✅ | ✅ | ? | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ? | ❌ | ✅ |
| Présences / absences | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notes + bulletins PDF | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ⚠️ | ✅ | ✅ |
| Bulletins au format officiel national | ? | ✅ (DREN) | ? | ? | ❌ | ❌ | ⚠️ (NG) | ⚠️ (IN) | ❌ | ❌ | ❌ | ✅ (FR) | ⚠️ (à confirmer) |
| Emploi du temps | ✅ | ✅ | ✅ (auto) | ✅ (auto) | ? | ✅ | ? | ✅ | ✅ | ✅ | ⚠️ | ✅ (EDT) | ❌ |
| Cahier de textes / devoirs | ✅ | ✅ (LMS) | ? | ? | ✅ | ? | ✅ | ? | ✅ | ✅ | ? | ✅ | ❌ |
| LMS / classe virtuelle / CBT | ❌ | ✅ | ⚠️ (quiz) | ⚠️ | ⚠️ | ? | ✅ | ⚠️ (visio) | ✅ | ✅ | ⚠️ (visio) | ❌ | ❌ |
| Facturation / frais / caisse | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Mobile money intégré (passerelle réelle) | ❌ | ? | ✅ | ✅ | ✅ | ❌ | ? | ⚠️ (gateways) | ❌ | ❌ | ❌ | ❌ | ⚠️ (type de paiement, sans passerelle) |
| Relances d'impayés automatiques | ❌ | ✅ | ? | ✅ | ✅ | ? | ? | ✅ | ? | ? | ? | ❌ | ❌ |
| Comptabilité (états financiers / OHADA) | ❌ | ✅ (supérieur) | ✅ (budget) | ❌ | ✅ | ✅ | ? | ? | ⚠️ | ✅ | ⚠️ | ❌ | ❌ |
| Paie / RH | ❌ | ? | ✅ | ? | ✅ | ✅ | ⚠️ (congés) | ✅ | ? | ✅ | ⚠️ | ❌ | ✅ (paie) |
| Transport | ❌ | ? | ✅ | ? | ✅ (suivi) | ? | ? | ⚠️ (GPS) | ? | ✅ | ❌ | ❌ | ✅ |
| Cantine | ❌ | ? | ✅ | ? | ✅ | ? | ? | ? | ? | ? | ? | ❌ | ❌ |
| Annonces | ✅ | ? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notifications in-app / push | ✅ | ? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ✅ | ✅ | ⚠️ (in-app seulement) |
| Envoi SMS | ? | ? | ✅ | ✅ | ✅ | ? | ✅ | ✅ | ? | ? | ? | ✅ | ❌ |
| Envoi email | ✅ | ? | ? | ? | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ? | ✅ | ❌ |
| WhatsApp | ❌ | ❌ | ❌ | ⚠️ | ? | ? | ? | ? | ? | ? | ? | ❌ | ❌ |
| Documents générés (certificats, attestations) | ⚠️ (modèles bulletins) | ✅ | ? | ✅ (reçus) | ✅ | ? | ✅ | ✅ | ✅ | ✅ (e-signature) | ✅ | ✅ (e-signature) | ❌ |
| Tableaux de bord / reporting | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (dashboard basique) |
| Alertes élèves à risque / analytique | ✅ (règles explicables) | ❌ | ⚠️ | ✅ | ✅ | ? | ❌ | ❌ | ✅ (prédictif) | ? | ❌ | ❌ | ❌ |
| Fonctions IA | ❌ (volontaire) | ❌ | ✅ (assistant données) | ✅ (pédago) | ✅ (appréciations) | ✅ (assistant) | ? | ❌ | ✅ | ? | ⚠️ | ❌ | ❌ |
| Rôles fixes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (8 rôles JWT) |
| Rôles / permissions personnalisables | ✅ | ✅ | ? | ? | ✅ | ? | ? | ✅ | ? | ✅ | ✅ | ⚠️ | ❌ |
| MFA | ✅ (obligatoire) | ⚠️ (optionnel) | ? | ? | ? | ? | ? | ? | ? | ? | ? | ✅ [I] | ❌ |
| Journal d'audit | ✅ | ✅ | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ❌ [I] |
| Marque blanche / branding par école | ✅ | ⚠️ (instance dédiée) | ? | ? | ? | ? | ? | ✅ (apps) | ? | ⚠️ | ? | ❌ | ❌ |
| Multi-établissement / groupe scolaire | ✅ (hiérarchie) | ✅ | ✅ | ✅ | ? | ✅ | ? | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ (code école, à confirmer) |
| Site / vitrine publique par école | ❌ | ⚠️ (portail inscription) | ? | ? | ⚠️ (boutique) | ? | ? | ? | ? | ⚠️ (CRM) | ? | ❌ | ✅ (/ecole/[code] basique) |
| App mobile native | ❌ (PWA) | ✅ | ✅ (Android) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Mode hors ligne | ⚠️ (PWA) | ? | ✅ | ? | ✅ | ❌ | ? | ? | ? | ? | ? | ? | ❌ |
| API publique documentée | ? | ✅ | ? | ? | ? | ? | ? | ⚠️ | ? | ✅ | ? | ⚠️ | ⚠️ (API interne) |
| Français natif | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ |
| Prix publics | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ (annuaires) | ❌ | ❌ | ❌ | ❌ | — |
| Certification sécurité réelle | ❌ (« ready ») | ❌ (déclaré) | ? | ❌ | ? | ? | ? | ? | ✅ ISO 27001 | ⚠️ (Azure) | ⚠️ (AWS) | ⚠️ (ISO 9001) | ❌ |
| Tests automatisés / qualité | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ❌ |

---

## 4. Typologie des fonctionnalités

### 4.1 Indispensables (le marché les considère acquises — GS doit les avoir pour être crédible)
- Élèves, parents, classes, inscriptions/réinscriptions, présences — **GS : OK**.
- Notes, moyennes, rangs, appréciations, **bulletins PDF au format attendu localement** (trimestres/semestres, coefficients, mentions ; conformité DREN/MENA pour la CI) — GS : OK à valider sur le format officiel.
- **Emploi du temps** (au minimum saisie manuelle + vues par classe/enseignant) — **GS : manquant**, présent chez presque tous.
- Frais scolaires : échéanciers, reçus, soldes, **relances** — GS : factures/paiements OK, relances manquantes.
- **Mobile money réel** (Orange, MTN, Moov, Wave) via agrégateur — GS : seulement un type de paiement ; Novacole et EduCI l'ont déjà.
- **SMS et email sortants** (absences, notes publiées, impayés) — GS : manquant.
- Espace parent consultable sur mobile (au moins PWA responsive) — GS : pas d'app ni PWA.
- Rôles et droits séparant direction / secrétariat / comptabilité / enseignants — GS : 8 rôles fixes, OK de base.
- Documents administratifs générés (certificat de scolarité, attestation, reçu, carte d'élève) — GS : manquant.
- Sauvegardes, export des données, politique de confidentialité publiée.

### 4.2 Différenciantes (pas universelles, font gagner des deals)
- Tarification transparente par élève en FCFA avec essai long (modèle Novacole).
- Rapprochement automatique des paiements mobile money sur le dossier élève.
- Paie intégrée conforme aux barèmes locaux (CNPS, ITS en CI) — GS a déjà une base de paie : **atout à renforcer**.
- Transport (GS l'a déjà) + notifications de ramassage.
- Mode hors ligne / faible bande passante.
- Vitrine publique de l'école + pré-inscription en ligne (GS l'a déjà, **rare chez les concurrents**).
- Permissions personnalisables, MFA, journal d'audit.
- Marque blanche (logo, couleurs, sous-domaine) par école.
- Export aux formats ministériels (DREN, EducMaster…).

### 4.3 Innovantes (peu d'acteurs, forte valeur perçue)
- **Alertes explicables** sur élèves à risque (règle citée + action proposée) — Pilotage.
- Assistant IA pour interroger les données (« combien d'impayés en 6e ? ») — Novacole, Ed-admin, openSIS.
- Génération d'appréciations de bulletin par IA avec relecture humaine — SchoolDesk.
- Canal **WhatsApp** officiel (quasi absent chez tous les concurrents lus, alors que c'est le canal dominant en Afrique de l'Ouest).
- Cartes/QR élèves pour pointage et porte-monnaie cantine — SchoolDesk.
- Fil quotidien avec photos pour la maternelle — Kinderpedia.
- Export .ics de l'EDT et des évaluations pour les familles — Pilotage.

### 4.4 À éviter
- IA opaque qui classe ou « note » les enfants sans explication (risque éthique et réglementaire ; Pilotage en fait un contre-argument).
- Classements nominatifs publics entre élèves visibles des parents.
- Revendications de conformité non étayées (« ISO 27001 ready », « conforme RGPD » sans DPA) — risque de crédibilité ; préférer la transparence à la KLASSCI.
- Tarifs opaques « sur devis » pour les petites écoles privées (frein à l'adoption face à Novacole/EduCI).
- Dépendance à du matériel propriétaire (bracelets, bornes) dès le départ.
- Empiler 50 modules superficiels : les concurrents africains gagnent par la simplicité et le mobile money, pas par l'exhaustivité.
- Liens morts sur le site public (pages Tarifs/CGU en 404 comme chez Pilotage) : effet très négatif sur la confiance.

---

## 5. Opportunités de différenciation concrètes pour GESTION SCHOOL

Classées par rapport impact / effort, en s'appuyant sur ce que GS possède déjà.

1. **Encaissement mobile money réel + rapprochement automatique** (priorité 1). Intégrer un agrégateur couvrant la zone UEMOA (ex. CinetPay, PayDunya, FedaPay, Money Fusion — à comparer) : lien de paiement par facture, webhook qui solde la facture, reçu PDF automatique envoyé au parent. C'est le principal écart avec Novacole et EduCI.
2. **Notifications multicanal SMS + WhatsApp + email**, déclenchées par événements déjà présents dans GS (absence saisie, bulletin publié, facture en retard, annonce). WhatsApp Business API = différenciateur net : aucun concurrent lu ne l'intègre vraiment.
3. **Relances d'impayés intelligentes** : échéancier par élève, relances programmées (J-3, J+7…), tableau de recouvrement pour le comptable. Valeur business directe pour le fondateur d'école privée.
4. **Emploi du temps** : combler le manque (v1 : saisie manuelle glisser-déposer + détection de conflits salle/enseignant ; v2 : génération assistée). Ajouter l'export .ics pour parents et enseignants.
5. **Vitrine publique + pré-inscription comme produit d'acquisition** : GS dispose déjà de `/ecole/[code]` — rare chez les concurrents. L'enrichir (logo, couleurs, galerie, frais affichés, formulaire avec pièces jointes, paiement des frais de dossier en mobile money, suivi du statut par SMS) et la vendre comme « site de l'école inclus ».
6. **Marque blanche multi-tenant** : logo, couleurs, en-tête des bulletins/reçus, sous-domaine par école — base pour vendre aux groupes scolaires.
7. **Bulletins conformes au format officiel ivoirien (DREN/MENA)** + **documents administratifs** (certificat de scolarité, attestation, carte d'élève avec QR) via un moteur de modèles. KLASSCI s'en sert comme argument ; c'est un critère d'achat local.
8. **Paie localisée CI** (CNPS, ITS, IGR, bulletins de paie PDF, états de déclaration) : GS a déjà la paie — la localiser en fait un avantage que KLASSCI/EduCI n'affichent pas.
9. **Alertes explicables élèves à risque** (règles transparentes : moyenne sous seuil, absences répétées, chute de tendance) avec action recommandée — innovation à faible coût technique, sans IA opaque, adaptée à la sensibilité des données enfants.
10. **IA utile et encadrée** (après les fondamentaux) : assistant de questions sur les données de l'école pour la direction, brouillons d'appréciations de bulletins validés par l'enseignant, résumé hebdomadaire parent. Toujours avec relecture humaine et journal d'usage.
11. **PWA parents/enseignants hors-ligne tolérante** avant une app native : saisie des présences et des notes hors connexion puis synchronisation ; consultation rapide sur réseau 3G. Réduit l'écart « app mobile » à moindre coût.
12. **Confiance et sécurité démontrables** : MFA pour admins/comptables, permissions personnalisables, journal d'audit, sauvegardes documentées, page sécurité honnête (hébergement, loi ivoirienne 2013-450 / ARTCI, RGPD pour l'international), **suite de tests automatisés** (aujourd'hui absente — prérequis avant toute vente sérieuse).
13. **Prix transparents en FCFA par élève/an avec essai gratuit** pour concurrencer Novacole (200–600 F CFA/élève/an) et EduCI (10 000–50 000 FCFA/mois) ; module « paiements » monétisable par petite commission ou forfait SMS.
14. **Onboarding rapide** : import Excel des élèves/parents/notes, modèle de rentrée (classes, matières, coefficients par défaut du système ivoirien), assistant de configuration en 30 minutes — la plupart des concurrents ne documentent pas cet aspect.

---

*Document de travail — les informations marquées [S] ou [I] doivent être confirmées par démo ou contact commercial avant toute communication externe.*
