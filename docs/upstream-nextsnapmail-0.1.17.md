# NextSnapMail 0.1.17 integration candidate — 10 November 2026

This branch imports the upstream release through `f1625b9f6240` into the
NextSnapMail subtree. It is a review candidate, not a production deployment.
The fork currently deployed as 0.1.16 was based on the older upstream lock
`99dcb2828c02`; matching version labels did not mean matching source trees.

The merge retains Pied Web's URL-scoped accounts, shared unread counters,
asset version marker and quiet notification default. The account-menu merge
keeps URL navigation; the newly added CardDAV read-only state is obtained from
the account-specific bootstrap after navigation. Controller routing combines
the existing `account`/`target` shell parameters with the upstream administrator
checks. The generated application JS, gzip and Brotli assets were rebuilt from
the merged source, with class names retained. Three new user-facing strings
were translated into French.

Validation:

- `./tools/test.sh` passes, including 19 new real-controller routing checks
  using in-memory service doubles. Administrator requests are rejected before
  dispatch for ordinary users; normal account shell and mail routes still work.
- The upstream navigation, list toolbar, application shell and Feed browser
  fixtures pass in an isolated browser, against this merged native source.
  Navigation first failed during initial layout; its unchanged rerun passed
  all 16 checks. The other three suites passed on their first run.
- `python3 tools/package-release.py` builds the review candidate; no existing
  release or tag is replaced.

The user's persistent Chrome responds through its debugging endpoint, but the
`dev-browser-agent` connection also timed out on a neutral page after the bounded
recovery procedure. No authenticated production Mail validation was possible.
Transport in the tests is simulated, and no real message was sent or changed.

Before deployment, obtain the required PR review, assign the next Pied Web
product version on main and refresh its release manifest. Then create a current
backup, compare the installed payload, install the reviewed fork, invalidate
web PHP and validate the authenticated runtime. Do not install the unmodified
App Store archive over the customized fork. The production maintenance on
10 November intentionally keeps NextSnapMail 0.1.16 and Pied Web 1.10.42.
