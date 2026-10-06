const page = await browser.getPage('nextsnapmail-list-toolbar');
page.setDefaultTimeout(10000);
const base = 'http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1';
const checks = [];
const check = (name,pass) => { if (!pass) throw Error(name); checks.push(name); console.log('PASS ' + name); };
const fresh = async suffix => {
    await page.goto(base + suffix);
    await page.waitForFunction(() => window.PiedWebUx?.feed && document.querySelector('.pw-list-scope-label'));
    await page.evaluate(() => {
        // Fixture transport stays fictional; use the native dropdown's class contract.
        for (const id of ['top-system-dropdown-id','more-list-dropdown-id']) {
            const trigger = document.getElementById(id);
            trigger.addEventListener('click',event => {
                event.preventDefault(); const open = trigger.parentElement.classList.toggle('show');
                trigger.setAttribute('aria-expanded',String(open));
                trigger.parentElement.querySelector('menu').classList.toggle('show',open);
            });
        }
    });
};
await page.setViewportSize({width:1440,height:900});
await fresh('&accounts=2');
await page.waitForFunction(() => document.querySelector('.pw-list-scope #V-SystemDropDown'));
check('Desktop has one visible account identity on the native account trigger',await page.evaluate(() => {
    const trigger = document.querySelector('#top-system-dropdown-id');
    return trigger.contains(document.querySelector('.pw-list-scope-label'))
        && getComputedStyle(trigger.querySelector('.pw-account-label')).display === 'none'
        && !document.querySelector('.pw-desktop-identity #V-SystemDropDown')
        && trigger.tabIndex === 0 && trigger.getAttribute('aria-haspopup') === 'menu';
}));
await page.locator('#top-system-dropdown-id').focus(); await page.keyboard.press('Space');
check('Space opens the original account menu beside the list identity',await page.evaluate(() => {
    const trigger = document.querySelector('#top-system-dropdown-id'), menu = trigger.parentElement.querySelector('menu');
    const a = trigger.getBoundingClientRect(), b = menu.getBoundingClientRect();
    return trigger.getAttribute('aria-expanded') === 'true' && b.width > 0 && Math.abs(a.left-b.left) < 2;
}));
await page.locator('#top-system-dropdown-id').click();
check('The search scope never occupies the list toolbar',await page.evaluate(() => !document.querySelector('#V-MailMessageList select[aria-label="Portée de la recherche"]')));

await page.evaluate(async () => {
    const popup = document.createElement('dialog'); popup.id = 'V-PopupsAdvancedSearch'; document.getElementById('rl-app').append(popup);
    const vm = {viewModelTemplateID:'PopupsAdvancedSearch',viewModelDom:popup};
    dispatchEvent(new CustomEvent('rl-view-model.create',{detail:vm}));
    popup.innerHTML = await (await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsAdvancedSearch.html')).text();
    popup.querySelectorAll('[data-bind]').forEach(n => n.removeAttribute('data-bind'));
    popup.querySelectorAll('[data-i18n]').forEach(n => n.textContent = rl.i18n(n.dataset.i18n));
    // Use the native submission boundary: the form passes its built query to mainSearch's hook.
    popup.querySelector('form').addEventListener('submit',event => {
        event.preventDefault(); rl.mailUi.onSearch('subject=projet&unseen'); popup.close();
    });
    window.toolbarSearchPopup = popup;
    dispatchEvent(new CustomEvent('rl-view-model',{detail:vm}));
    popup.showModal();
});
check('The late native advanced-search template owns the labelled scope select',await page.evaluate(() => {
    const select = document.querySelector('#V-PopupsAdvancedSearch #pw-search-scope');
    return !!select && select.labels[0].textContent === 'Portée de la recherche' && select.value === 'global';
}));
const before = await page.evaluate(() => mailboxFixtureCalls.length);
await page.locator('#pw-search-scope').selectOption('account');
check('Choosing a scope waits for form submission',await page.evaluate(n => mailboxFixtureCalls.length === n,before));
await page.evaluate(() => { toolbarSearchPopup.close(); });
await page.waitForFunction(() => document.querySelector('#pw-search-scope').value === 'global');
check('Cancelling restores the committed search scope without a request',await page.evaluate(n => mailboxFixtureCalls.length === n,before));
await page.evaluate(() => { toolbarSearchPopup.showModal(); });
await page.locator('#pw-search-scope').selectOption('account');
await page.locator('.buttonAdvSearch').click();
await page.waitForFunction(() => mailboxFixtureCalls.some(call => call.operation === 'search'));
check('Advanced search submits its combined native filters in the chosen account scope',await page.evaluate(() => {
    const call = mailboxFixtureCalls.find(call => call.operation === 'search');
    return call.search === 'subject=projet&unseen' && call.scope === 'all'
        && JSON.parse(call.accountHashes).join() === 'a'.repeat(40);
}));

const morePosition = () => page.evaluate(() => {
    const a = document.querySelector('#more-list-dropdown-id').getBoundingClientRect();
    const b = document.querySelector('.pw-list-more-menu').getBoundingClientRect();
    return b.width > 0 && b.left >= 11 && b.right <= innerWidth-11 && b.bottom <= innerHeight-7
        && Math.min(Math.abs(b.top-a.bottom),Math.abs(b.bottom-a.top)) <= 5
        && (Math.abs(b.left-a.left) <= 1 || Math.abs(b.right-(innerWidth-12)) <= 1);
});
for (const viewport of [{width:1440,height:900},{width:1000,height:620},{width:390,height:844},{width:390,height:440}]) {
    await page.setViewportSize(viewport);
    await page.locator('#more-list-dropdown-id').click();
    await page.waitForFunction(() => document.querySelector('.pw-list-more-menu').style.getPropertyValue('--pw-list-menu-top'));
    check(`More menu stays beside its trigger and inside ${viewport.width} × ${viewport.height}`,await morePosition());
    await page.locator('#more-list-dropdown-id').click();
}
check('Mobile restores its existing account header and leaves the scope in the popup',await page.evaluate(() =>
    !!document.querySelector('.pw-mobile-identity #V-SystemDropDown')
    && !document.querySelector('#top-system-dropdown-id .pw-list-scope-label')
    && getComputedStyle(document.querySelector('.pw-account-label')).display !== 'none'
    && !!document.querySelector('#V-PopupsAdvancedSearch #pw-search-scope')));
await page.setViewportSize({width:1440,height:900});
await page.waitForFunction(() => document.querySelector('.pw-list-scope #top-system-dropdown-id .pw-list-scope-label'));
await page.evaluate(() => { document.documentElement.dataset.themes = 'dark'; });
check('Dark desktop keeps the single account trigger',await page.evaluate(() =>
    !!document.querySelector('.pw-list-scope #top-system-dropdown-id .pw-list-scope-label')
    && getComputedStyle(document.querySelector('.pw-account-label')).display === 'none'));
await page.evaluate(() => { document.querySelector('#app-theme-style').dataset.name = 'Default'; });
await page.waitForFunction(() => !document.documentElement.classList.contains('pw-theme')
    && !document.querySelector('#top-system-dropdown-id .pw-list-scope-label'));
check('Leaving Pied Web restores the native identity and hides its optional search scope',await page.evaluate(() =>
    !document.querySelector('#top-system-dropdown-id .pw-list-scope-label')
    && getComputedStyle(document.querySelector('.pw-search-scope-field')).display === 'none'));
await page.setViewportSize({width:1440,height:900});
await fresh('');
await page.locator('.b-folders-system a.selectable:not(.pw-feed-link)').first().click();
await page.waitForFunction(() => PiedWebUx.feed.mode() === 'inbox');
await page.evaluate(() => document.fonts.ready);
check('Desktop prioritizes the translated folder above a quiet account without a coloured container',await page.evaluate(() => {
    const trigger = document.querySelector('#top-system-dropdown-id');
    const context = trigger.querySelector('.pw-list-scope-context'), account = trigger.querySelector('.pw-list-scope-account');
    return context.textContent === 'Boîte de réception'
        && context.getBoundingClientRect().bottom < account.getBoundingClientRect().top
        && context.scrollWidth <= context.clientWidth && account.scrollWidth <= account.clientWidth
        && getComputedStyle(account).fontWeight === '400'
        && getComputedStyle(trigger).backgroundColor === 'rgba(0, 0, 0, 0)'
        && getComputedStyle(trigger.closest('.btn-toolbar')).backgroundColor === 'rgba(0, 0, 0, 0)';
}));
await page.locator('#top-system-dropdown-id').hover();
check('Account hover uses the neutral grey token',await page.evaluate(() => {
    const trigger = document.querySelector('#top-system-dropdown-id'), probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--pw-grey-100)'; trigger.append(probe);
    const neutral = getComputedStyle(probe).backgroundColor; probe.remove();
    return getComputedStyle(trigger).backgroundColor === neutral;
}));
await page.evaluate(() => {
    systemVM.accountName = () => 'alexandrine.martin.' + 'service-'.repeat(12) + '@atelier.example.test';
    document.documentElement.lang = 'en';
    document.querySelector('.pw-feed-link[data-pw-feed="account"]').click();
    document.querySelector('.b-folders-system a.selectable:not(.pw-feed-link)').click();
});
await page.setViewportSize({width:800,height:620});
check('A long account truncates inside the list while retaining its full accessible label',await page.evaluate(() => {
    const trigger = document.querySelector('#top-system-dropdown-id'), account = trigger.querySelector('.pw-list-scope-account');
    const a = trigger.getBoundingClientRect(), list = document.querySelector('#V-MailMessageList').getBoundingClientRect();
    return trigger.querySelector('.pw-list-scope-context').textContent === 'Inbox'
        && account.scrollWidth > account.clientWidth && a.right <= list.right
        && trigger.getAttribute('aria-label').includes(account.textContent)
        && trigger.querySelector('.pw-list-scope-label').title.includes(account.textContent);
}));
await page.setViewportSize({width:1440,height:900});
await page.evaluate(() => { document.documentElement.lang = 'fr'; });
await page.evaluate(() => {
    const popup = document.createElement('div'); popup.id = 'V-PopupsAdvancedSearch';
    popup.innerHTML = '<form id="advancedsearchform"><div></div></form>'; document.getElementById('rl-app').append(popup);
    dispatchEvent(new CustomEvent('rl-view-model',{detail:{viewModelTemplateID:'PopupsAdvancedSearch',viewModelDom:popup}}));
});
check('One account offers folder/account search without an All my accounts option',await page.evaluate(() =>
    document.querySelector('#pw-search-scope').value === 'folder' && document.querySelector('#pw-search-scope option[value="global"]').hidden));
check('The toolbar workflow has no fixture runtime errors',await page.evaluate(() => fixtureErrors.length === 0));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
