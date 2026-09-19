const page = await browser.getPage('nextsnapmail-feed');
page.setDefaultTimeout(10000);
const checks = [];
const check = (name, ok) => {
    if (!ok) throw new Error(name);
    checks.push(name);
    console.log('PASS ' + name);
};
const base = 'http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1';
const fresh = async url => {
    await page.goto(url);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.PiedWebUx?.feed && feedRequests.length > 0);
};

await page.setViewportSize({width:1200, height:900});
await fresh(base);
await page.waitForFunction(() => PiedWebUx.feed.mode() === 'feed');
check('A single account exposes one account Feed and no All accounts entry', await page.evaluate(() => {
    const visible = [...document.querySelectorAll('.pw-feed-nav')].filter(item => !item.hidden);
    return visible.length === 1
        && visible[0].textContent.trim() === 'Flux'
        && document.querySelector('.pw-global-nav').hidden
        && PiedWebUx.feed.accountCount() === 1;
}));
check('The account Feed is the default while the native Inbox remains distinct', await page.evaluate(() => {
    const inbox = document.querySelector('.b-folders-system a.selectable:not(.pw-feed-link)');
    return document.querySelector('.pw-feed-link[data-pw-feed="account"]').classList.contains('selected')
        && !inbox.classList.contains('selected')
        && PiedWebUx.feed.mode() === 'feed';
}));
await page.evaluate(() => rl.app.Remote.request('MessageList', () => {}, {folder:'INBOX'}));
check('Only account Feed requests carry the enrichment marker', await page.evaluate(() =>
    actionCalls.at(-1)[1] === 'MessageList' && actionCalls.at(-1)[2].PiedWebFeed === '1'));

await page.locator('.b-folders-system a.selectable:not(.pw-feed-link)').first().click();
await page.waitForFunction(() => PiedWebUx.feed.mode() === 'inbox');
await page.evaluate(() => rl.app.Remote.request('MessageList', () => {}, {folder:'INBOX'}));
check('Opening Inbox restores the untouched native request and selection', await page.evaluate(() => {
    const inbox = document.querySelector('.b-folders-system a.selectable:not(.pw-feed-link)');
    return inbox.classList.contains('selected')
        && actionCalls.at(-1)[1] === 'MessageList'
        && !Object.hasOwn(actionCalls.at(-1)[2], 'PiedWebFeed');
}));
await page.locator('.pw-feed-link[data-pw-feed="account"]').click();
await page.waitForFunction(() => PiedWebUx.feed.mode() === 'feed');
check('The account Feed can be restored without changing folder', await page.evaluate(() =>
    document.querySelector('.pw-feed-link[data-pw-feed="account"]').classList.contains('selected')
    && actionCalls.includes('reload')));

check('Single-account settings contain no global-feed choice or inclusion control', await page.evaluate(() => {
    const select = document.querySelector('#pw-feed-default-view');
    const globalRow = [...document.querySelectorAll('.pw-feed-setting-row')]
        .find(row => row.textContent.includes('Tous les comptes'));
    return [...select.options].map(option => option.textContent).join('|') === 'Flux|Boîte de réception'
        && globalRow?.hidden === true;
}));
check('Single-account startup never requests the global endpoint', await page.evaluate(() =>
    feedRequests.every(request => request.operation !== 'global')));
check('Single-account view has no runtime error', await page.evaluate(() => fixtureErrors.length === 0));

await fresh(base + '&feedDefault=inbox');
await page.waitForFunction(() => PiedWebUx.feed.mode() === 'inbox' && actionCalls.includes('reload'));
await page.evaluate(() => rl.app.Remote.request('MessageList', () => {}, {folder:'INBOX'}));
check('A saved native Inbox opening is reloaded without Feed enrichment', await page.evaluate(() =>
    document.querySelector('.b-folders-system a.selectable:not(.pw-feed-link)').classList.contains('selected')
    && actionCalls.at(-1)[1] === 'MessageList'
    && !Object.hasOwn(actionCalls.at(-1)[2], 'PiedWebFeed')));

await fresh(base + '&accounts=2&accountsLoading=1');
await page.waitForFunction(() => PiedWebUx.feed.mode() === 'global'
    && document.querySelectorAll('.pw-global-row').length === 5);
check('An empty native account store during bootstrap does not lose the global default', await page.evaluate(() =>
    PiedWebUx.feed.accountCount() === 2
    && !document.querySelector('.pw-global-nav').hidden));

await fresh(base + '&accounts=2');
await page.waitForFunction(() => PiedWebUx.feed.mode() === 'global'
    && document.querySelectorAll('.pw-global-row').length === 5);
check('Multiple accounts default to All accounts and keep the account Feed available', await page.evaluate(() => {
    const visible = [...document.querySelectorAll('.pw-feed-nav')].filter(item => !item.hidden);
    return visible.map(item => item.textContent.trim()).join('|') === 'Tous les comptes|Flux'
        && document.querySelector('.pw-global-nav .pw-feed-link').classList.contains('selected')
        && PiedWebUx.feed.accountCount() === 2;
}));
check('The global feed follows the four expected priority groups', await page.evaluate(() =>
    [...document.querySelectorAll('.pw-global-rows h2')].map(heading => heading.textContent).join('|')
    === 'Brouillons non lus|Messages non lus|Conversations avec un ancien non-lu|Messages lus'));
check('Global rows retain their source account and chronological priority', await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.pw-global-row')];
    return rows.map(row => row.querySelector('.pw-global-subject').textContent).join('|')
        === 'Réponse en attente|Ancien message non lu|Message professionnel|Conversation à reprendre|Dernier message lu'
        && rows.some(row => row.textContent.includes('Personnel · alex@example.test'))
        && rows.some(row => row.textContent.includes('Pied Web · hello@example.test'));
}));
check('Native message rows and cross-message actions are hidden in global mode', await page.evaluate(() => {
    const nativeList = document.querySelector('.fixture-list');
    const checkAll = document.querySelector('#V-MailMessageList .checkboxCheckAll');
    return getComputedStyle(nativeList).display === 'none' && getComputedStyle(checkAll).display === 'none';
}));

await page.evaluate(() => [...document.querySelectorAll('.pw-feed-settings-panel .pw-feed-setting-row')]
    .find(row => row.textContent.includes('Afficher les messages lus')).querySelector('input').click());
await page.waitForFunction(() => feedSettings.showRead === false
    && ![...document.querySelectorAll('.pw-global-row')].some(row => row.textContent.includes('Dernier message lu')));
check('The per-account setting can hide read messages from the global feed', await page.evaluate(() =>
    feedRequests.some(request => request.showRead === 0)
    && document.querySelectorAll('.pw-global-row').length === 4));
check('Multi-account settings expose the global default and inclusion control', await page.evaluate(() => {
    const select = document.querySelector('#pw-feed-default-view');
    const globalRow = [...document.querySelectorAll('.pw-feed-setting-row')]
        .find(row => row.textContent.includes('Tous les comptes'));
    return [...select.options].map(option => option.textContent).join('|')
        === 'Tous les comptes|Flux du compte|Boîte de réception'
        && globalRow?.hidden === false;
}));

await page.evaluate(() => {
    window.globalRequestsBeforeSentDraft = feedRequests.filter(request => request.operation === 'global').length;
    feedGlobalItems = feedGlobalItems.filter(item => item._pwKind !== 'draft');
    dispatchEvent(new CustomEvent('pw-message-sent', {detail:{account:'a'.repeat(40),folder:'',uid:0,flag:''}}));
});
await page.waitForFunction(() => ![...document.querySelectorAll('.pw-global-row')]
    .some(row => row.textContent.includes('Réponse en attente')));
check('A successful send refreshes a global Feed that still showed its draft', await page.evaluate(() =>
    feedRequests.filter(request => request.operation === 'global').length > globalRequestsBeforeSentDraft
    && document.querySelectorAll('.pw-global-row').length === 3));

await page.setViewportSize({width:390, height:844});
check('The global feed remains inside the mobile viewport with touch-sized rows', await page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth
    && [...document.querySelectorAll('.pw-global-row')].every(row => {
        const rect = row.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44;
    })));

await page.setViewportSize({width:1200, height:900});
await page.locator('.pw-global-row').filter({hasText:'Message professionnel'}).click();
await page.waitForFunction(() => window.systemVM && window.PiedWebUx?.feed
    && systemVM.accountEmail() === 'hello@example.test'
    && PiedWebUx.feed.mode() === 'feed'
    && location.hash.includes('/mailbox/INBOX/m301'));
check('Opening another account switches safely before navigating to its source message', await page.evaluate(() =>
    systemVM.accountEmail() === 'hello@example.test'
    && new URLSearchParams(location.search).get('account') === 'b'.repeat(40)
    && sessionStorage.getItem('pw-mail-feed-open') === null
    && sessionStorage.getItem('pw-mail-view:' + 'b'.repeat(40)) === 'feed'
    && location.hash === '#/mailbox/INBOX/m301'
    && !actionCalls.some(call => Array.isArray(call) && call[1] === 'AccountSwitch')));
check('Cross-account opening has no runtime error', await page.evaluate(() => fixtureErrors.length === 0));

console.log(JSON.stringify({passed:checks.length, checks}, null, 2));
