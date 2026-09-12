<div class="section">
	<form class="nextsnapmail" action="personal.php" method="post">
		<input type="hidden" name="requesttoken" value="<?php echo $_['requesttoken'] ?>" id="requesttoken">
		<fieldset class="personalblock">
			<h2><?php echo $l->t('NextSnapMail Webmail'); ?></h2>
			<p>
				<?php echo $l->t('Enter an email and password to auto-login to NextSnapMail.'); ?>
			</p>
			<p>
				<input type="text" id="nextsnapmail-email" name="nextsnapmail-email"
					value="<?php echo $_['nextsnapmail-email']; ?>" placeholder="<?php echo($l->t('Email')); ?>" />

				<input type="password" id="nextsnapmail-password" name="nextsnapmail-password"
					value="<?php echo $_['nextsnapmail-password']; ?>" placeholder="<?php echo($l->t('Password')); ?>" />

				<button id="nextsnapmail-save-button" name="nextsnapmail-save-button"><?php echo($l->t('Save')); ?></button>
				&nbsp;&nbsp;<span class="nextsnapmail-result-desc"></span>
			</p>
			<?php if (!empty($_['gmail-oauth-enabled'])): ?>
				<p>
					<a class="button" href="<?php echo \htmlspecialchars($_['gmail-oauth-url'], ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); ?>">
						<?php echo($l->t('Connect Gmail / Google account')); ?>
					</a>
				</p>
				<p class="settings-hint">
					<?php echo($l->t('This will replace the saved main account credentials for NextSnapMail with a Google OAuth login.')); ?>
				</p>
			<?php endif; ?>
			<?php if (!empty($_['gmail-oauth-message'])): ?>
				<p class="nextsnapmail-success">
					<?php echo \htmlspecialchars($_['gmail-oauth-message'], ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); ?>
				</p>
			<?php endif; ?>
			<?php if (!empty($_['gmail-oauth-error'])): ?>
				<p class="nextsnapmail-error">
					<?php echo \htmlspecialchars($_['gmail-oauth-error'], ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); ?>
				</p>
			<?php endif; ?>
		</fieldset>
	</form>
</div>
