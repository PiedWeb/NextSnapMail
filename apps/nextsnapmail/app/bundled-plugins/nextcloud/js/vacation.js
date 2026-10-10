(rl => {
	if (!rl) {
		return;
	}

	const
		SCRIPT_NAME = 'nextsnapmail.user',
		LEGACY_SCRIPT_NAME = 'rainloop.user',
		BLOCK_REGEX = /^# BEGIN:NEXTSNAPMAIL:VACATION\s*$[\s\S]*?^# END:NEXTSNAPMAIL:VACATION\s*$/gm,
		DATA_REGEX = /^# NEXTSNAPMAIL:VACATION-DATA\s+([A-Za-z0-9+/=]+)\s*$/m,
		REQUIRED_CAPABILITIES = ['vacation', 'date', 'relational'];

	const dateValue = date => {
		const pad = value => String(value).padStart(2, '0');
		return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
	};

	const encodeData = value => btoa(unescape(encodeURIComponent(JSON.stringify(value))));
	const decodeData = value => JSON.parse(decodeURIComponent(escape(atob(value))));
	const quote = value => '"' + String(value).replace(/(\\|")/g, '\\$1').replace(/[\r\n]+/g, ' ') + '"';
	const textLiteral = value => String(value)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(line => line.startsWith('.') ? '.' + line : line)
		.join('\r\n');

	const removeManagedBlock = body => String(body || '').replace(BLOCK_REGEX, '').replace(/\s+$/, '');

	const executableBody = body => removeManagedBlock(body)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*#.*$/gm, '');

	const hasUnmanagedVacation = body => /^\s*vacation(?:\s|:)/mi.test(executableBody(body));

	const modernizeHeader = body => String(body || '')
		.replace('# This is SnappyMail sieve script.', '# This is a NextSnapMail Sieve script.')
		.replace("# Please don't change anything here.", '# Please do not edit managed sections manually.')
		.replace('# RAINLOOP:SIEVE', '# NEXTSNAPMAIL:SIEVE');

	const addRequirements = (body, requirements) => {
		let result = String(body || ''),
			match = result.match(/^\s*require\s+(\[[\s\S]*?\]|"(?:\\.|[^"])*")\s*;/m),
			values = [];

		if (match) {
			for (const item of match[1].matchAll(/"((?:\\.|[^"])*)"/g)) {
				values.push(item[1].replace(/\\([\\"])/g, '$1'));
			}
		}
		values.push(...requirements);
		values = [...new Set(values)].sort();
		const declaration = 'require [' + values.map(quote).join(',') + '];';
		return match
			? result.replace(match[0], declaration)
			: declaration + '\r\n\r\n' + result;
	};

	class NextSnapMailVacationUserSettings
	{
		constructor()
		{
			this.sieveEnabled = !!(rl.settings.get('Capa') || {}).Sieve;
			this.loading = ko.observable(false);
			this.saving = ko.observable(false);
			this.loaded = ko.observable(false);
			this.profiles = ko.observableArray([]);
			this.selectedProfile = ko.observable(null);
			this.preservedProfiles = ko.observableArray([]);
			this.error = ko.observable('');
			this.success = ko.observable(false);
			this.capabilities = ko.observableArray([]);
			this.conflictingVacation = ko.observable(false);
			this.usingLegacyScript = ko.observable(false);
			this.activeScriptName = '';
			this.sourceScriptName = SCRIPT_NAME;
			this.sourceBody = '';
			this.scripts = {};

			this.missingCapabilities = ko.computed(() => REQUIRED_CAPABILITIES.filter(
				capability => !this.capabilities().includes(capability)
			));
			this.serverSupported = ko.computed(() => this.loaded() && !this.missingCapabilities().length);
			this.busy = ko.computed(() => this.loading() || this.saving());
			this.removePreservedProfile = this.removePreservedProfile.bind(this);
		}

		onBuild()
		{
			this.sieveEnabled && this.load();
		}

		load()
		{
			this.loading(true);
			this.loaded(false);
			this.error('');
			this.success(false);
			rl.app.Remote.request('Filters', (error, data) => {
				this.loading(false);
				if (error || !data?.Result) {
					this.error(data?.messageAdditional || data?.message || 'Unable to load Sieve settings.');
					return;
				}

				this.capabilities((data.Result.Capa || []).map(value => String(value).toLowerCase()));
				this.scripts = data.Result.Scripts || {};
				const list = Array.isArray(this.scripts) ? this.scripts : Object.values(this.scripts),
					next = list.find(script => script?.name === SCRIPT_NAME),
					legacy = list.find(script => script?.name === LEGACY_SCRIPT_NAME);
				this.activeScriptName = list.find(script => script?.active)?.name || '';

				if (next?.body) {
					this.sourceScriptName = SCRIPT_NAME;
					this.sourceBody = next.body;
				} else if (legacy?.body) {
					this.sourceScriptName = LEGACY_SCRIPT_NAME;
					this.sourceBody = legacy.body;
					this.usingLegacyScript(true);
				} else {
					this.sourceScriptName = SCRIPT_NAME;
					this.sourceBody = '# This is a NextSnapMail Sieve script.\r\n'
						+ '# Please do not edit managed sections manually.\r\n'
						+ '# NEXTSNAPMAIL:SIEVE\r\n';
				}

				this.conflictingVacation(hasUnmanagedVacation(this.sourceBody));
				this.loadProfiles(this.readManagedData(this.sourceBody));
			});
		}

		createProfile(email, name = '', values = {})
		{
			const end = new Date();
			end.setDate(end.getDate() + 7);
			const senderName = String(values.senderName ?? name ?? '').trim(),
				storedInterval = Math.max(1, parseInt(values.replyInterval, 10) || 7),
				intervalMode = values.replyIntervalMode
					|| (storedInterval === 1 ? 'daily' : (storedInterval === 7 ? 'weekly' : 'custom'));
			return {
				email: String(email || '').trim(),
				label: senderName ? senderName + ' <' + email + '>' : String(email || '').trim(),
				enabled: ko.observable(!!values.enabled),
				startDate: ko.observable(values.startDate || dateValue(new Date())),
				endDate: ko.observable(values.endDate || dateValue(end)),
				senderName: ko.observable(senderName),
				subject: ko.observable(values.subject || ''),
				message: ko.observable(values.message || ''),
				replyIntervalMode: ko.observable(intervalMode),
				customReplyInterval: ko.observable(Math.max(1, parseInt(values.customReplyInterval, 10) || storedInterval))
			};
		}

		replyInterval(profile)
		{
			if (profile.replyIntervalMode() === 'daily') {
				return 1;
			}
			if (profile.replyIntervalMode() === 'weekly') {
				return 7;
			}
			if (profile.replyIntervalMode() === 'whole') {
				const start = Date.parse(profile.startDate() + 'T00:00:00Z'),
					end = Date.parse(profile.endDate() + 'T00:00:00Z');
				return Number.isFinite(start) && Number.isFinite(end)
					? Math.max(1, Math.floor((end - start) / 86400000) + 1)
					: 1;
			}
			return Math.max(1, parseInt(profile.customReplyInterval(), 10) || 1);
		}

		profileData(profile)
		{
			return {
				email: profile.email,
				enabled: !!profile.enabled(),
				startDate: profile.startDate(),
				endDate: profile.endDate(),
				senderName: String(profile.senderName() || '').trim(),
				subject: String(profile.subject() || '').trim(),
				message: String(profile.message() || ''),
				replyIntervalMode: profile.replyIntervalMode(),
				customReplyInterval: Math.max(1, parseInt(profile.customReplyInterval(), 10) || 1),
				replyInterval: this.replyInterval(profile)
			};
		}

		loadProfiles(storedData)
		{
			rl.app.Remote.request('AccountsAndIdentities', (error, data) => {
				const identities = !error && Array.isArray(data?.Result?.Identities)
					? data.Result.Identities
					: [];
				this.buildProfiles(identities, storedData);
				this.loaded(true);
			});
		}

		buildProfiles(identities, storedData)
		{
			const accountEmail = String(rl.settings.get('Email') || '').trim(),
				candidates = identities
					.filter(identity => identity?.email)
					.sort((left, right) => Number(!!left?.id) - Number(!!right?.id))
					.map(identity => ({email: String(identity.email).trim(), name: String(identity.name || '').trim()}));

			if (accountEmail && !candidates.some(item => item.email.toLowerCase() === accountEmail.toLowerCase())) {
				candidates.unshift({email: accountEmail, name: ''});
			}

			const unique = new Map();
			for (const candidate of candidates) {
				const key = candidate.email.toLowerCase();
				if (!unique.has(key) || (!unique.get(key).name && candidate.name)) {
					unique.set(key, candidate);
				}
			}

			let storedProfiles = [];
			if (Array.isArray(storedData?.profiles)) {
				storedProfiles = storedData.profiles.filter(profile => profile?.email);
			} else if (storedData) {
				const addresses = String(storedData.addresses || accountEmail)
					.split(',').map(value => value.trim()).filter(Boolean);
				storedProfiles = addresses.map((email, index) => {
					const profile = {...storedData, email};
					if (index) {
						delete profile.senderName;
					}
					return profile;
				});
			}

			const profiles = [...unique.values()].map(candidate => {
				const stored = storedProfiles.find(item => String(item.email || '').toLowerCase() === candidate.email.toLowerCase());
				return this.createProfile(candidate.email, candidate.name, stored || {});
			});
			this.preservedProfiles(Array.isArray(storedData?.profiles)
				? storedProfiles
					.filter(stored => !unique.has(String(stored.email || '').trim().toLowerCase()))
					.map(stored => this.profileData(this.createProfile(stored.email, stored.senderName, stored)))
					.filter(profile => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
				: []);
			this.profiles(profiles);
			this.selectedProfile(profiles.find(profile => profile.enabled()) || profiles[0] || null);
		}

		removePreservedProfile(profile)
		{
			if (this.busy() || !profile
				|| !window.confirm(rl.i18n('NEXTCLOUD_VACATION/CONFIRM_REMOVE_PRESERVED', {EMAIL: profile.email}))) {
				return;
			}
			this.preservedProfiles.remove(profile);
			this.success(false);
		}

		readManagedData(body)
		{
			const block = String(body || '').match(BLOCK_REGEX)?.[0] || '',
				encoded = block.match(DATA_REGEX)?.[1];
			if (!encoded) {
				return null;
			}
			try {
				return decodeData(encoded);
			}
			catch (error)
			{
				this.error('The existing NextSnapMail vacation settings could not be read.');
				return null;
			}
		}

		validate()
		{
			this.error('');
			for (const profile of this.profiles()) {
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
					this.error(rl.i18n('NEXTCLOUD_VACATION/ERROR_ADDRESSES'));
					return false;
				}
				if (!profile.enabled()) {
					continue;
				}
				if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.startDate()) || !/^\d{4}-\d{2}-\d{2}$/.test(profile.endDate())) {
					this.error(rl.i18n('NEXTCLOUD_VACATION/ERROR_DATES') + ' (' + profile.email + ')');
					return false;
				}
				if (profile.endDate() < profile.startDate()) {
					this.error(rl.i18n('NEXTCLOUD_VACATION/ERROR_DATE_ORDER') + ' (' + profile.email + ')');
					return false;
				}
				if (!String(profile.message() || '').trim()) {
					this.error(rl.i18n('NEXTCLOUD_VACATION/ERROR_MESSAGE') + ' (' + profile.email + ')');
					return false;
				}
				if (profile.replyIntervalMode() === 'custom'
					&& (!/^\d+$/.test(String(profile.customReplyInterval())) || parseInt(profile.customReplyInterval(), 10) < 1)) {
					this.error(rl.i18n('NEXTCLOUD_VACATION/ERROR_INTERVAL') + ' (' + profile.email + ')');
					return false;
				}
			}
			return true;
		}

		managedBlock()
		{
			const data = {
				version: 3,
				profiles: [
					...this.profiles().map(profile => this.profileData(profile)),
					...this.preservedProfiles()
				]
			};
			const result = [
				'# BEGIN:NEXTSNAPMAIL:VACATION',
				'# NEXTSNAPMAIL:VACATION-DATA ' + encodeData(data)
			], enabledProfiles = data.profiles.filter(profile => profile.enabled),
				hasEnvelope = this.capabilities().includes('envelope');

			enabledProfiles.forEach((profile, index) => {
				const parameters = [':days ' + profile.replyInterval, ':addresses [' + quote(profile.email) + ']'],
					recipientTests = [
						'address :is ["to", "cc", "bcc", "resent-to", "resent-cc", "resent-bcc"] ' + quote(profile.email)
					];
				if (hasEnvelope) {
					recipientTests.unshift('envelope :is "to" ' + quote(profile.email));
				}
				parameters.push(':from ' + quote(
					profile.senderName ? profile.senderName + ' <' + profile.email + '>' : profile.email
				));
				profile.subject && parameters.push(':subject ' + quote(profile.subject));
				result.push(
					(index ? 'elsif' : 'if') + ' allof(',
					'    currentdate :value "ge" "date" ' + quote(profile.startDate) + ',',
					'    currentdate :value "le" "date" ' + quote(profile.endDate) + ',',
					'    anyof(' + recipientTests.join(', ') + ')',
					') {',
					'    vacation ' + parameters.join(' ') + ' text:',
					textLiteral(profile.message),
					'.',
					'    ;',
					'}'
				);
			});
			if (!enabledProfiles.length) {
				result.push('# Vacation message is disabled.');
			}
			result.push('# END:NEXTSNAPMAIL:VACATION');
			return result.join('\r\n');
		}

		buildBody()
		{
			let body = modernizeHeader(removeManagedBlock(this.sourceBody));
			if (this.profiles().some(profile => profile.enabled())) {
				const requirements = [...REQUIRED_CAPABILITIES];
				this.capabilities().includes('envelope') && requirements.push('envelope');
				body = addRequirements(body, requirements);
			}
			return body.replace(/\s+$/, '') + '\r\n\r\n' + this.managedBlock() + '\r\n';
		}

		save()
		{
			if (this.busy() || !this.serverSupported() || this.conflictingVacation() || !this.validate()) {
				return;
			}

			if (this.profiles().some(profile => profile.enabled()) && this.activeScriptName
				&& ![SCRIPT_NAME, this.sourceScriptName].includes(this.activeScriptName)
				&& !window.confirm(rl.i18n('NEXTCLOUD_VACATION/CONFIRM_ACTIVATE'))
			) {
				return;
			}

			this.saving(true);
			this.success(false);
			this.error('');
			const body = this.buildBody();
			rl.app.Remote.request('FiltersScriptSave', (error, data) => {
				if (error) {
					this.saving(false);
					this.error(data?.messageAdditional || data?.message || rl.i18n('NEXTCLOUD_VACATION/ERROR_SAVE'));
					return;
				}

				const activate = this.profiles().some(profile => profile.enabled()) || this.activeScriptName === this.sourceScriptName;
				if (!activate || this.activeScriptName === SCRIPT_NAME) {
					this.saveFinished(body);
					return;
				}

				rl.app.Remote.request('FiltersScriptActivate', (activateError, activateData) => {
					if (activateError) {
						this.saving(false);
						this.error(activateData?.messageAdditional || activateData?.message || rl.i18n('NEXTCLOUD_VACATION/ERROR_ACTIVATE'));
						return;
					}
					this.activeScriptName = SCRIPT_NAME;
					this.saveFinished(body);
				}, {name: SCRIPT_NAME});
			}, {name: SCRIPT_NAME, active: false, body});
		}

		saveFinished(body)
		{
			this.sourceBody = body;
			this.sourceScriptName = SCRIPT_NAME;
			this.usingLegacyScript(false);
			this.saving(false);
			this.success(true);
			setTimeout(() => this.success(false), 4000);
		}
	}

	rl.addSettingsViewModel(
		NextSnapMailVacationUserSettings,
		'NextSnapMailVacationUserSettings',
		'NEXTCLOUD_VACATION/TAB_NAME',
		'vacation'
	);
})(window.rl);
