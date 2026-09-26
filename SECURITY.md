# Politique de sécurité — GESTION SCHOOL

GESTION SCHOOL est un ERP scolaire multi-établissement. Il traite des **données d'élèves
mineurs**, de parents, de personnel (paie) et de paiements. Une faille ici a un impact réel sur
des familles : merci de la signaler de façon responsable.

## Signaler une vulnérabilité

Utilisez **Security → Report a vulnerability** (GitHub Private Vulnerability Reporting) plutôt
qu'une issue publique, en indiquant : le composant (route API, page, service Docker), la façon de
reproduire, et ce qu'un attaquant y gagnerait.

Ce qui nous intéresse en priorité :

- accès aux données d'un **autre établissement** (isolation `schoolId`) ou d'un autre élève
  depuis le portail parent (IDOR) ;
- contournement de l'authentification JWT ou des rôles (`@Roles`) ;
- exposition de données personnelles via les routes publiques (`/api/public/...`) ;
- falsification d'un paiement, d'une facture, d'un bulletin ou d'une fiche de paie ;
- secret présent dans le dépôt ou dans une image Docker.

Délai de réponse visé : 7 jours.

## Comment la sécurité est outillée dans ce dépôt

La méthode DevSecOps agentique est décrite dans [`docs/devsecops.md`](docs/devsecops.md) :
règles de l'agent (`CLAUDE.md`), sous-agents spécialisés, garde-fous automatiques
(secrets, dépendances, SAST) et gates CI bloquants (`.github/workflows/security-gates.yml`).
Principe : *l'IA propose, un scanner ou un test prouve, un humain décide.*

Les garde-fous de l'agent **ne sont pas un bac à sable** : ils réduisent la surface d'erreur d'un
agent coopératif ; ils ne remplacent ni la revue de code, ni la branch protection, ni le moindre
privilège sur les vrais secrets.

## Versions supportées

Seule la branche `main` reçoit des correctifs de sécurité.
