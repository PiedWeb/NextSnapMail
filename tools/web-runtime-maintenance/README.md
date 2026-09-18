# Targeted web OPcache maintenance

These are **temporary operator tools for the recorded n0c installation**, not permanent
plugin payload. The PHP boot paths deliberately target `/home/robindfr/nextcloud`.
Review them before use on another host or after an engine update. Keep install.php,
cleanup.php and configuration backups outside the web root.

The repair was exercised through an existing authenticated Nextcloud administrator
session on 2026-09-12. The native plugin JSON dispatcher checks CSRF. The additional
hook requires POST, an authenticated mail account and a Nextcloud administrator.
It only inspects/invalidates five fixed PHP files of `pied-web-ux`; it accepts no path.
It does not reset all OPcache, create credentials, alter mail or change host PHP settings.
The temporary directory carries a version suffix because LiteSpeed can retain the helper's own
deleted PHP path in OPcache. Bump that suffix whenever this helper changes; otherwise a future
run can execute its former fixed-file list.

1. Copy these three PHP files to a **new private staging directory** on the host.
2. Run `php install.php` there over SSH. It refuses an existing backup/plugin, saves
   application.ini privately, enables the temporary plugin through native Config::Save,
   and records the configuration fingerprint. No browser reload is needed for the hook.
3. In the already connected NextSnapMail page, use the native API:

   ```js
   rl.pluginRemoteRequest((error, data) => console.log(error, data?.Result),
       'PiedWebRuntimeCheck', {}, 15000);
   ```

   Compare the **web** `version` with the installed release. If stale:

   ```js
   rl.pluginRemoteRequest((error, data) => console.log(error, data?.Result),
       'PiedWebRuntimeCheck', {invalidate: '1'}, 15000);
   ```

   Call again with `{}` in a new request to confirm the new PHP class version. The same
   request cannot replace a class definition already loaded in its process.
4. Run `php cleanup.php` over SSH. It checks that configuration has not changed
   concurrently, clears the native configuration cache, restores the exact original
   bytes and removes the temporary plugin. If the fingerprint changed, stop and merge
   only the temporary enabled-list entry out; never overwrite concurrent preferences.
5. Fetch fresh AppData, then reload the mail page after checking no compose is open.
   Verify the served Plugins bundle, theme marker, live DOM and required endpoint.
   An old Plugins URL is not evidence of current web PHP after removing the temporary
   plugin. CLI and web hashes can differ because the hash includes registered paths.
6. Confirm there is no maintenance plugin left and installed payload hashes still match.
   Keep the private backup outside the web root. Do not commit application.ini.

A standalone PHP probe under the Nextcloud web root was rejected by routing during the
incident. It was removed. Use the native authenticated extension mechanism above.
Do not try to work around Nextcloud's routing or authentication checks.

The installer final status output was simplified after the incident: it must not refer
to a plugin class that CLI Config initialization has not loaded. This affects logging,
not the tested enable/backup/cleanup operations. All three files pass PHP syntax checks.
