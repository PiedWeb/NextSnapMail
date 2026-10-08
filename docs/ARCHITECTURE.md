# Architecture du monorepo

## Décision

Le monorepo possède l’expérience utilisateur complète tout en gardant la
divergence du moteur mail explicite et aussi petite que possible. Le découpage
n’est plus « application contre thème », mais « contrats natifs contre produit ».

| Zone | Responsabilité |
| --- | --- |
| `apps/nextsnapmail` | app Nextcloud, session, authentification, contexte de compte, routage, API et points d’extension stables |
| `packages/pied-web` | interface, workflows utilisateur, design system, thème, intégrations facultatives et fixtures navigateur |
| `tools` | orchestration commune, suivi amont, tests et production des artefacts |

Une fonctionnalité commence dans `packages/pied-web` lorsqu’elle peut utiliser
un contrat public et stable. Si elle doit intercepter le DOM, remplacer un
état global ou reproduire une primitive native, le contrat manquant est ajouté
dans `apps/nextsnapmail`, puis consommé par Pied Web.

## Historique importé

Les dépôts d’origine (`RobinDev/NextSnapMail`, `RobinDev/nextsnapmail-pied-web`)
ont été importés avec leur historique ; ils restent sur GitHub, sans développement.

## Synchronisation de NextSnapMail

`UPSTREAM.lock.json` est le relevé du dernier commit amont accepté. Le contrôle
automatique suit cette séquence :

1. lire la tête distante avec `git ls-remote` ;
2. ne rien faire si elle correspond au verrou ;
3. créer une branche `automation/nextsnapmail-<sha>` ;
4. fusionner l’amont dans le subtree `apps/nextsnapmail` ;
5. actualiser le verrou ;
6. exécuter `tools/test.sh` ;
7. pousser la branche et ouvrir une pull request.

Un conflit crée un signal de maintenance ; il ne doit jamais être résolu par la
copie d’un bundle minifié ou par un `push --force` sur `main`.

## Branches et publication

- `main` : état produit intégrable, non protégé ; on y commite directement ou
  on y fusionne une branche `feature/*` courte.
- `feature/*` : une capacité produit ou un contrat natif. Après fusion, la
  branche et son worktree sont supprimés.
- `automation/nextsnapmail-*` : propositions générées depuis l’amont, intégrées
  par pull request revue.
- tags `piedweb-mail-v*` : artefacts déployables et reproductibles. Le numéro de
  version n’est attribué qu’à l’intégration sur `main`, et un tag publié n’est
  jamais déplacé.

La CI tourne sur ces trois familles de branches et sur les pull requests.

La publication fabrique deux archives depuis le même commit : l’application
Nextcloud `nextsnapmail` et le paquet Pied Web. Le manifeste placé dans `dist/`
relie leurs versions, leurs empreintes et le commit du monorepo. Cela permet de
les installer séparément tout en conservant une seule source de vérité.

## Déploiement

La migration Git ne change pas la procédure de production. Avant toute
installation, comparer la version et les empreintes installées, sauvegarder les
composants ciblés hors de la racine Web, installer les fichiers de version en
dernier et vérifier le runtime authentifié. LiteSpeed peut continuer à exécuter
un ancien PHP malgré des fichiers corrects sur disque.

Depuis NextSnapMail 0.1.12, le contexte de compte par onglet est conçu
directement dans cette architecture : identifiant opaque dans l’URL, résolution
serveur par requête et tests croisés. Le cookie de compte additionnel ne sert
plus qu’aux anciens clients qui n’envoient aucun contexte explicite.
