(rl => {
	const config = rl.settings.get('NextSnapMailGmailOAuth') || {};
	if (!config.StartUrl) {
		return;
	}

	const addAccountLabel = config.AddAccountLabel || 'Add Gmail / Google account',
		startAdditionalLogin = () => {
			document.location = config.StartUrl + (config.StartUrl.includes('?') ? '&' : '?') + 'mode=additional';
		},
		injectAdditionalAccountButton = root => {
			if (!root || root.querySelector('.nextsnapmail-gmail-oauth-additional-account')) {
				return;
			}

			const accountsList = root.querySelector('.accounts-list'),
				target = accountsList?.parentNode || root,
				controls = document.createElement('div'),
				button = document.createElement('button');
			controls.className = 'nextsnapmail-gmail-oauth-additional-account controls';
			controls.style.margin = '10px 0';
			button.type = 'button';
			button.textContent = addAccountLabel;
			button.onclick = startAdditionalLogin;
			controls.append(button);
			accountsList ? target.insertBefore(controls, accountsList) : target.append(controls);
		},
		injectAccountPopupButton = root => {
			if (!root || root.querySelector('.nextsnapmail-gmail-oauth-popup-account')) {
				return;
			}

			const form = root.querySelector('#accountform');
			if (!form) {
				return;
			}

			const footer = root.querySelector('footer') || form.parentNode,
				button = document.createElement('button'),
				info = document.createElement('div');

			button.type = 'button';
			button.className = 'btn nextsnapmail-gmail-oauth-popup-account';
			button.textContent = addAccountLabel;
			button.style.marginRight = '8px';
			button.onclick = event => {
				event.preventDefault();
				event.stopPropagation();
				startAdditionalLogin();
			};

			info.className = 'nextsnapmail-gmail-oauth-popup-account-info';
			info.style.margin = '8px 0 0 160px';
			info.style.opacity = '0.75';
			info.textContent = 'Gmail / Google OAuth2';

			footer.insertBefore(button, footer.firstChild);
			form.append(info);
		},
		injectAccountMenuButton = root => {
			const doc = root || document,
				anchors = Array.from(doc.querySelectorAll('#top-system-dropdown-id')),
				menus = [
					...anchors
						.map(anchor => anchor.closest('.dropdown')?.querySelector('menu.dropdown-menu'))
						.filter(Boolean),
					...Array.from(doc.querySelectorAll('menu[aria-labelledby="top-system-dropdown-id"]'))
				];

			menus.forEach(menu => {
				if (menu.querySelector('.nextsnapmail-gmail-oauth-account-menu-add')) {
					return;
				}

				const li = document.createElement('li'),
					link = document.createElement('a'),
					addAccountLink = menu.querySelector('a[data-i18n="TOP_TOOLBAR/BUTTON_ADD_ACCOUNT"]');
				li.className = 'dividerbar nextsnapmail-gmail-oauth-account-menu-add';
				li.setAttribute('role', 'presentation');
				link.href = '#';
				link.tabIndex = -1;
				link.setAttribute('data-icon', 'G');
				link.textContent = addAccountLabel;
				link.onclick = event => {
					event.preventDefault();
					event.stopPropagation();
					startAdditionalLogin();
				};
				li.append(link);

				if (addAccountLink?.parentElement) {
					addAccountLink.parentElement.after(li);
				} else {
					menu.prepend(li);
				}
			});
		},
		injectAll = () => {
			document.querySelectorAll('[data-view-model-template="SettingsAccounts"], .accounts-list')
				.forEach(el => injectAdditionalAccountButton(el.closest('[data-view-model-template="SettingsAccounts"]') || document));
			document.querySelectorAll('#V-PopupsAccount, #accountform')
				.forEach(el => injectAccountPopupButton(el.closest('#V-PopupsAccount') || document));
			injectAccountMenuButton(document);
		};

	addEventListener('rl-view-model', e => {
		if ('SettingsAccounts' === e.detail.viewModelTemplateID) {
			injectAdditionalAccountButton(e.detail.viewModelDom);
		}

		if ('PopupsAccount' === e.detail.viewModelTemplateID) {
			injectAccountPopupButton(e.detail.viewModelDom);
		}

		if ('SystemDropDownUser' === e.detail.viewModelTemplateID) {
			injectAccountMenuButton(e.detail.viewModelDom);
		}
	});

	new MutationObserver(injectAll).observe(document.body, {
		attributes: true,
		childList: true,
		subtree: true
	});

	injectAll();
	setTimeout(injectAll, 250);
	setTimeout(injectAll, 1000);
	setTimeout(injectAll, 2500);
})(window.rl);
