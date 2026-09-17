# Pied Web as the enforced default theme — 16 September 2026

At the owner's request, the production NextSnapMail configuration now uses
`PiedWeb@nextcloud` as its global theme and disables per-account theme selection.
This makes Pied Web apply to newly added mail accounts and to existing accounts;
stored account-level theme choices are ignored while `allow_themes` is disabled.

## Change and verification

The intervention changed only the `[webmail]` `theme` and `allow_themes` values in
the private NextSnapMail `application.ini`. No plugin, theme, account or message
file changed. The installed versions were Nextcloud 34.0.4, NextSnapMail 0.1.11,
embedded SnappyMail 2.38.2 and Pied Web 1.7.53. Before the change, the installed
Pied Web stylesheet matched the 1.7.53 release fingerprint.

The configuration SHA-256 changed from
`30951c9d7e22f3989056fd51f32ba036208440c99552a29e077abde37d2047d3` to
`f9cfe4303b93f9d715469244d42fa312e43a0ba790fc8a76430145fde585e0ce`.
The SnappyMail CLI runtime then reported `PiedWeb@nextcloud` as both configured
and validated, found the theme in its available-theme list, and reported theme
selection disabled. `occ status` reported maintenance off and no database
upgrade required. The public Mail route remained reachable and returned its
expected unauthenticated `401` response. No PHP changed, so LiteSpeed OPcache
invalidation was not required.

The exact private pre-change configuration and rollback metadata are outside the
web root in:

```text
/home/robindfr/nextsnapmail-backups/theme-policy-20260916T150006Z/
```

## Rollback

Rollback is valid only while the installed configuration still has the recorded
post-change SHA-256. From `~/nextcloud`, first compare that fingerprint, then
restore `application.ini.before` while preserving its mode. Verify that the
restored SHA-256 is the recorded pre-change value, run `occ status`, and confirm
through the SnappyMail runtime that the global theme is `NextcloudV25+` and theme
selection is enabled. If the current fingerprint differs, merge the two setting
changes into the current file instead of overwriting newer private configuration.
