<div class="section">
	<form class="nextsnapmail" action="admin.php" method="post">
		<input type="hidden" name="requesttoken" value="<?php echo $_['requesttoken'] ?>" id="requesttoken">
		<fieldset class="personalblock">
			<h2><?php echo($l->t('NextSnapMail Webmail')); ?></h2>
			<br />
			<?php if ($_['nextsnapmail-admin-panel-link']) { ?>
			<p>
				<a href="<?php echo $_['nextsnapmail-admin-panel-link'] ?>" style="text-decoration: underline">
					<?php echo($l->t('Go to NextSnapMail Webmail admin panel')); ?>
				</a>
			<?php if ($_['nextsnapmail-admin-password']) { ?>
				<br/>
				Username: admin<br/>
				Temporary password: <?php echo $_['nextsnapmail-admin-password']; ?>
			<?php } ?>
			</p>
			<br />
			<?php } ?>
			<p>
				<div style="display: flex;">
					<input type="radio" id="nextsnapmail-noautologin" name="nextsnapmail-autologin" value="0" <?php if (!$_['nextsnapmail-autologin']&&!$_['nextsnapmail-autologin-with-email']) echo 'checked="checked"'; ?> />
					<label style="margin: auto 5px;" for="nextsnapmail-noautologin">
						<?php echo($l->t('Users will login manually, or define credentials in their personal settings for automatic logins.')); ?>
					</label>
				</div>
				<div style="display: flex;">
					<input type="radio" id="nextsnapmail-autologin" name="nextsnapmail-autologin" value="1" <?php if ($_['nextsnapmail-autologin']) echo 'checked="checked"'; ?> />
					<label style="margin: auto 5px;" for="nextsnapmail-autologin">
						<?php echo($l->t('Attempt to automatically login users with their Nextcloud username and password, or user-defined credentials, if set.')); ?>
					</label>
				</div>
				<div style="display: flex;">
					<input type="radio" id="nextsnapmail-autologin-with-email" name="nextsnapmail-autologin" value="2" <?php if ($_['nextsnapmail-autologin-with-email']) echo 'checked="checked"'; ?> />
					<label style="margin: auto 5px;" for="nextsnapmail-autologin-with-email">
						<?php echo($l->t('Attempt to automatically login users with their Nextcloud email and password, or user-defined credentials, if set.')); ?>
					</label>
				</div>
			</p>
			<br />

			<p>
				<input id="nextsnapmail-autologin-oidc" name="nextsnapmail-autologin-oidc" type="checkbox" class="checkbox" <?php if ($_['nextsnapmail-autologin-oidc']) echo 'checked="checked"'; ?>>
				<label for="nextsnapmail-autologin-oidc">
					<?php echo($l->t('Attempt to automatically login with OIDC when active')); ?>
				</label>
			</p>
			<br />

			<p>
				<input id="nextsnapmail-no-embed" name="nextsnapmail-no-embed" type="checkbox" class="checkbox" <?php if ($_['nextsnapmail-no-embed']) echo 'checked="checked"'; ?>>
				<label for="nextsnapmail-no-embed">
					<?php echo($l->t('Don\'t fully integrate in Nextcloud, use in iframe')); ?>
				</label>
			</p>
			<br />
			<p>
				<input id="nextsnapmail-debug" name="nextsnapmail-debug" type="checkbox" class="checkbox" <?php if ($_['nextsnapmail-debug']) echo 'checked="checked"'; ?>>
				<label for="nextsnapmail-debug">
					<?php echo($l->t('Debug')); ?>
				</label>
			</p>
			<br />
			<?php if ($_['can-import-rainloop']) { ?>
			<p>
				<input id="import-rainloop" name="import-rainloop" type="checkbox" class="checkbox">
				<label for="import-rainloop">
					<?php echo($l->t('Import RainLoop data')); ?>
				</label>
			</p>
			<br />
			<?php } ?>

			<p>
				<input id="nextsnapmail-nc-lang" name="nextsnapmail-nc-lang" type="checkbox" class="checkbox" <?php if ($_['nextsnapmail-nc-lang']) echo 'checked="checked"'; ?>>
				<label for="nextsnapmail-nc-lang">
					<?php echo($l->t('Force Nextcloud personal language')); ?>
				</label>
			</p>
			<br />
			<p>
				<label for="nextsnapmail-app_path">
					<?php echo($l->t('app_path')); ?>
				</label>
				<input id="nextsnapmail-app_path" name="nextsnapmail-app_path" type="text" <?php echo 'value="'.\htmlspecialchars($_['nextsnapmail-app_path']).'"'; ?> style="width:20em">
			</p>
			<br />

			<p>
				<strong><?php echo($l->t('Gmail / Google OAuth2')); ?></strong><br />
				<span><?php echo($l->t('Configure this to let users connect Gmail or Google Workspace accounts without a password.')); ?></span>
			</p>
			<p>
				<label for="nextsnapmail-gmail-oauth-client-id">
					<?php echo($l->t('Client ID')); ?>
				</label>
				<input id="nextsnapmail-gmail-oauth-client-id" name="nextsnapmail-gmail-oauth-client-id" type="text" <?php echo 'value="'.\htmlspecialchars($_['gmail-oauth-client-id']).'"'; ?> style="width:40em">
			</p>
			<p>
				<label for="nextsnapmail-gmail-oauth-client-secret">
					<?php echo($l->t('Client Secret')); ?>
				</label>
				<input id="nextsnapmail-gmail-oauth-client-secret" name="nextsnapmail-gmail-oauth-client-secret" type="password" placeholder="<?php echo $_['gmail-oauth-client-secret-set'] ? \htmlspecialchars($l->t('Leave empty to keep existing secret')) : ''; ?>" style="width:40em">
			</p>
			<p>
				<label for="nextsnapmail-gmail-oauth-domains">
					<?php echo($l->t('Email domains')); ?>
				</label><br />
				<textarea id="nextsnapmail-gmail-oauth-domains" name="nextsnapmail-gmail-oauth-domains" rows="3" style="width:40em"><?php echo \htmlspecialchars($_['gmail-oauth-domains']); ?></textarea>
			</p>
			<p>
				<label for="nextsnapmail-gmail-oauth-auto-configure">
					<input id="nextsnapmail-gmail-oauth-auto-configure" name="nextsnapmail-gmail-oauth-auto-configure" type="checkbox" class="checkbox" <?php if ($_['gmail-oauth-auto-configure']) echo 'checked="checked"'; ?>>
					<?php echo($l->t('Automatically configure Gmail domains')); ?>
				</label>
			</p>
			<p class="settings-hint">
				<?php echo($l->t('Authorized redirect URI for Google Cloud Console:')); ?>
				<code><?php echo \htmlspecialchars($_['gmail-oauth-callback-url'], ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); ?></code>
			</p>
			<br />

			<p>
				<button id="nextsnapmail-import-snappymail-button" type="button">
					<?php echo($l->t('Import old SnappyMail data')); ?>
				</button>
				<div class="nextsnapmail-import-result-desc"></div>
			</p>
			<br />

			<p>
				<strong><?php echo($l->t('Install plugin package')); ?></strong><br />
				<span><?php echo($l->t('Upload only trusted SnappyMail/NextSnapMail plugin packages. Plugins are executable PHP code.')); ?></span><br />
				<input id="nextsnapmail-plugin-package" name="nextsnapmail-plugin-package" type="file" accept=".tgz,.tar.gz,.zip">
				<br />
				<label for="nextsnapmail-plugin-overwrite">
					<input id="nextsnapmail-plugin-overwrite" name="nextsnapmail-plugin-overwrite" type="checkbox" class="checkbox">
					<?php echo($l->t('Overwrite existing plugin after creating a backup')); ?>
				</label>
				<br />
				<button id="nextsnapmail-upload-plugin-button" type="button">
					<?php echo($l->t('Upload and install plugin')); ?>
				</button>
				<div class="nextsnapmail-plugin-upload-result-desc" style="white-space: pre-wrap"></div>
			</p>
			<br />

			<p style="margin-top: 2em;">
				<button id="nextsnapmail-reset-button" type="button" style="background-color: #d32f2f; border-color: #d32f2f; color: #fff;">
					<?php echo($l->t('Reset Nextsnapmail')); ?>
				</button>
				<div class="nextsnapmail-reset-result-desc" style="white-space: pre-wrap"></div>
			</p>
			<br />

			<p>
				<button id="nextsnapmail-save-button" name="nextsnapmail-save-button"><?php echo($l->t('Save')); ?></button>
				<div class="nextsnapmail-result-desc" style="white-space: pre"></div>
			</p>
		</fieldset>
	</form>
</div>
