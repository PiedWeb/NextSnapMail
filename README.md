# Pied Web NextSnapMail

[![CI](https://github.com/PiedWeb/NextSnapMail/actions/workflows/ci.yml/badge.svg)](https://github.com/PiedWeb/NextSnapMail/actions/workflows/ci.yml)

Monorepo de l’application Mail utilisée par Pied Web dans Nextcloud. Il réunit
le fork applicatif de NextSnapMail et la couche produit Pied Web afin que le
code, les tests et les versions puissent évoluer dans une seule branche.

```text
apps/nextsnapmail/   application Nextcloud et moteur SnappyMail embarqué
packages/pied-web/  interface, fonctionnalités, thème et intégrations Pied Web
docs/                architecture et règles de maintenance du monorepo
tools/               tests, synchronisation amont et empaquetage
```

## Développer

```sh
./tools/test.sh
python3 tools/check-upstream.py
python3 tools/package-release.py
```

`tools/test.sh` exécute les tests du correctif cœur puis les vérifications et
tests du paquet Pied Web. `package-release.py` ne lit ni configuration privée,
ni compte, ni message : il assemble exclusivement les fichiers versionnés.

Depuis NextSnapMail 0.1.12, l’identifiant opaque du compte actif est porté par
l’URL et propagé aux requêtes Mail. Plusieurs onglets d’un même navigateur
peuvent ainsi rester sur des boîtes différentes sans état serveur par onglet.

## Relation avec l’amont

Le composant `apps/nextsnapmail` est importé depuis
[`oe79/NextSnapMail`](https://github.com/oe79/NextSnapMail). Le commit amont
accepté est enregistré dans [`UPSTREAM.lock.json`](UPSTREAM.lock.json).

Le workflow `Upstream watch` vérifie quotidiennement la branche amont. Lorsqu’un
nouveau commit existe, il crée une branche de synchronisation, tente le merge du
subtree, lance toute la CI puis ouvre une pull request. Il ne publie et ne
déploie jamais automatiquement.

## Dépôts historiques

Les dépôts `RobinDev/NextSnapMail` et `RobinDev/nextsnapmail-pied-web` restent
des sources historiques et des destinations d’export possibles. Le monorepo
est désormais la source de vérité. `tools/export-splits.sh` prépare des branches
séparées sans les pousser ni réécrire un dépôt distant.

## Documentation

- [Architecture et politique d’amont](docs/ARCHITECTURE.md)
- [Mémoire produit Pied Web](packages/pied-web/docs/CONTEXT.md)
- [Maintenance et déploiement](packages/pied-web/docs/MAINTENANCE.md)

Les composants restent distribués sous AGPL-3.0-only ; voir leurs fichiers
`LICENSE` respectifs.
