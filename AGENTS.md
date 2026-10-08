# Working on Pied Web NextSnapMail

This monorepo is the source of truth for the Pied Web mail product.

- Read `README.md`, `docs/ARCHITECTURE.md`, `UPSTREAM.lock.json`,
  `packages/pied-web/docs/CONTEXT.md` and
  `packages/pied-web/docs/MAINTENANCE.md` before changing behavior.
- Treat `apps/nextsnapmail` as an upstream subtree with explicit, reviewable
  product commits on top. Never replace it with an old bundle or generated
  archive.
- Put Nextcloud integration, authentication, routing, account context and
  stable native extension points in `apps/nextsnapmail`.
- Put product features, theme, design tokens, optional integrations and browser
  fixtures in `packages/pied-web` unless a native contract requires a core
  change.
- Run `./tools/test.sh` before committing. Run `python3 tools/package-release.py`
  for a release candidate.
- Write commit messages as `type(mail): subject` (Conventional Commits: `feat`,
  `fix`, `style`, `perf`, `docs`, `build`, …).
- Commit on `main` or on a short `feature/*` branch. Assign a version number
  only when the change lands on `main`; never move a published tag. Remove the
  branch and its worktree once merged.
- Upstream synchronization must arrive through a reviewed pull request. Never
  auto-deploy an upstream commit.
- Preserve French/English labels, keyboard access, mobile and dark mode.
- Never commit Nextcloud configuration, credentials, accounts, mail content,
  tokens, private screenshots or production backups.
- Production deployment still follows
  `packages/pied-web/docs/MAINTENANCE.md`, including LiteSpeed OPcache
  invalidation and authenticated browser verification.
