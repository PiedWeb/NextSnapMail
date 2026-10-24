// Import the current core fragments instead of freezing pre-update markup.
const page = await browser.getPage('nextsnapmail-upstream-navigation');
page.setDefaultTimeout(7000);
const checks = [];
const check = (name, ok) => {
    if (!ok) throw new Error(name);
    checks.push(name); console.log('PASS ' + name);
};
const base = 'http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=1';
const core = '/app/snappymail/v/2.38.2/app/templates/Views/User/';
for (const dark of [false,true]) {
    await page.emulateMedia({colorScheme:dark ? 'dark' : 'light'});
    await page.setViewportSize({width:1440,height:900});
    await page.goto(base + (dark ? '&dark=1' : ''));
    await page.waitForFunction(() => window.PiedWebUx?.feed && document.querySelector('.pw-list-scope-label'));
    await page.evaluate(async core => {
        const fragment = async (view, selector) => {
            const html = await (await fetch(core + view + '.html')).text();
            const node = new DOMParser().parseFromString(html,'text/html').querySelector(selector);
            if (!node) throw new Error('Missing native fragment: ' + selector);
            return document.importNode(node,true);
        };
        const scope = await fragment('MailMessageList','.simple-search-scope');
        const label = scope.querySelector('label');
        scope.replaceChildren(...['Dossier actuel','Tous les dossiers','Dossier et sous-dossiers'].map((name,index) => {
            const choice = label.cloneNode(true);
            choice.querySelector('input').value = ['', 'all', 'subtree'][index];
            choice.querySelector('span').textContent = name;
            return choice;
        }));
        document.querySelector('.inputSearch').parentElement.append(scope);
        const filter = await fragment('MailFolderList','.folder-list-filter');
        filter.querySelector('span').textContent = 'Afficher uniquement les dossiers contenant des messages non lus';
        document.querySelector('.b-folders .b-content > .e-checkbox').replaceWith(filter);
        const popup = document.createElement('dialog'); popup.id = 'V-PopupsAdvancedSearch';
        popup.innerHTML = await (await fetch(core + 'PopupsAdvancedSearch.html')).text();
        document.querySelector('#rl-app').append(popup);
        dispatchEvent(new CustomEvent('rl-view-model',{detail:{viewModelTemplateID:'PopupsAdvancedSearch',viewModelDom:popup}}));
    },core);
    check(`New native controls retain their bindings (${dark ? 'dark' : 'light'})`,await page.evaluate(() =>
        document.querySelector('.folder-list-filter input').dataset.bind === 'checked: filterUnseen'
        && document.querySelector('.simple-search-scope input').dataset.bind.includes('simpleSearchScope')));
    for (const width of [1440,1000,390,320]) {
        await page.setViewportSize({width,height:900});
        check(`Native additions leave the toolbar and folder navigation intact at ${width}px (${dark ? 'dark' : 'light'})`,await page.evaluate(() => {
            const hidden = selector => getComputedStyle(document.querySelector(selector)).display === 'none';
            const input = document.querySelector('.inputSearch').getBoundingClientRect();
            return hidden('.simple-search-scope') && hidden('.folder-list-filter')
                && input.top >= 0 && input.bottom <= 100
                && document.documentElement.scrollWidth <= innerWidth;
        }));
    }
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(() => document.documentElement.classList.add('rl-left-panel-disabled'));
    check('The compact folder rail also excludes the new native filter',await page.evaluate(() =>
        getComputedStyle(document.querySelector('.folder-list-filter')).display === 'none'
        && document.querySelector('.pw-folder-rail-button')));
    await page.evaluate(() => document.documentElement.classList.remove('rl-left-panel-disabled'));
    await page.locator('#V-PopupsAdvancedSearch').evaluate(popup => { popup.classList.add('animate'); popup.showModal(); });
    check('Advanced search presents one scope while retaining the native binding for theme exit',await page.evaluate(() => {
        const popup = document.querySelector('#V-PopupsAdvancedSearch');
        const native = [...popup.querySelectorAll('[data-bind]')].find(node => node.dataset.bind.includes('selectedTreeValue'));
        return !!native && !native.parentElement.getClientRects().length
            && popup.querySelector('#pw-search-scope').getBoundingClientRect().width > 0
            && popup.querySelector('#pw-search-scope option[value="subtree"]');
    }));
    await page.locator('#V-PopupsAdvancedSearch').evaluate(popup => popup.close());
    await page.evaluate(() => document.documentElement.classList.remove('pw-theme'));
    check('Leaving Pied Web restores the new native controls',await page.evaluate(() =>
        getComputedStyle(document.querySelector('.simple-search-scope')).display !== 'none'
        && getComputedStyle(document.querySelector('.folder-list-filter')).display !== 'none'
        && getComputedStyle(document.querySelector('.pw-native-search-scope')).display !== 'none'));
}
console.log(JSON.stringify({passed:checks.length,checks},null,2));
