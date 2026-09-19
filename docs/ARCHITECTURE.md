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

- `apps/nextsnapmail` part du commit amont verrouillé, puis porte les deux
  commits du correctif des compteurs de comptes liés.
- `packages/pied-web` conserve l’historique de sa branche `main` jusqu’à
  `b4305f1`, puis un commit séparé capture le travail local 1.9.2 qui n’était pas
  encore publié au moment de la migration.
- Les dépôts GitHub historiques ne sont ni effacés ni réécrits. Leurs clones
  locaux redondants ont été retirés après vérification de l'import et publication
  du monorepo ; ils restent récupérables depuis leurs remotes et la corbeille locale.

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

- `main` : état produit intégrable ; protégée sur GitHub.
- `feature/*` : une capacité produit ou un contrat natif.
- `automation/nextsnapmail-*` : propositions générées depuis l’amont.
- tags `piedweb-mail-v*` : artefacts déployables et reproductibles.

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

Le futur contexte de compte par onglet sera le premier changement conçu
directement dans cette architecture : résolution serveur dans l’app, état
d’onglet côté client et tests croisés pour les opérations destructrices.
