const page = await browser.getPage('nextsnapmail-unread-order');
page.setDefaultTimeout(10000);
const checks = [];
const check = (name, ok) => {
    if (!ok) throw new Error(name);
    checks.push(name);
    console.log('PASS ' + name);
};

await page.setViewportSize({width: 1200, height: 900});
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&threads=1&unreadOrder=1');
await page.waitForFunction(() => document.querySelector('.pw-unread-order')?.getAttribute('aria-busy') === 'false');
await page.waitForFunction(() => listVM.messageList().map(message => message.uid).join(',') === '5,3,2,1,4,6,7,8,9,10');
check('The two Inbox preferences are simultaneously active', await page.evaluate(() =>
    document.querySelector('.pw-threads').getAttribute('aria-pressed') === 'true'
    && document.querySelector('.pw-unread-order').getAttribute('aria-pressed') === 'true'
    && document.querySelector('.pw-feed-settings').contains(document.querySelector('.pw-threads'))));
check('Unread received messages are oldest-first before read messages', await page.evaluate(() =>
    listVM.messageList().map(message => message.uid).join(',') === '5,3,2,1,4,6,7,8,9,10'
    && [...document.querySelectorAll('.fixture-list > .messageListItem')].map(row => ko.dataFor(row).uid).join(',') === '5,3,2,1,4,6,7,8,9,10'));
check('Read received messages remain newest-first', await page.evaluate(() => {
    const read = listVM.messageList().filter(message => !message.isUnseen());
    return read.map(message => message.uid).join(',') === '4,6,7,8,9,10'
        && read.every((message, index) => !index || read[index - 1].dateTimestamp() > message.dateTimestamp());
}));
check('The setting load is account-scoped and read-only', await page.evaluate(() =>
    unreadOrderRequests.length === 1 && Object.keys(unreadOrderRequests[0]).length === 0
    && PiedWebUx.unreadOrder.behavior() === 1));

await page.evaluate(() => listVM.messageList().find(message => message.uid === 3).isUnseen(false));
await page.waitForTimeout(100);
check('Mode 1 keeps an automatically read message in place', await page.evaluate(() =>
    listVM.messageList().map(message => message.uid).join(',') === '5,3,2,1,4,6,7,8,9,10'));
await page.evaluate(() => listVM.messageList.valueHasMutated());
await page.waitForFunction(() => listVM.messageList().map(message => message.uid).join(',') === '5,2,1,3,4,6,7,8,9,10');
check('Mode 1 applies the fresh order on the next list refresh', await page.evaluate(() =>
    listVM.messageList().map(message => message.uid).join(',') === '5,2,1,3,4,6,7,8,9,10'));

await page.locator('.pw-unread-order').click();
await page.waitForFunction(() => !unreadOrderEnabled && document.querySelector('.pw-unread-order').getAttribute('aria-busy') === 'false');
check('Disabling persists the opposite state and asks the native list to reload', await page.evaluate(() =>
    unreadOrderRequests.at(-1)?.enabled === 0
    && document.querySelector('.pw-unread-order').getAttribute('aria-pressed') === 'false'
    && actionCalls.includes('reload')));

await page.evaluate(() => {
    listVM.messageList().search = 'from:example.test';
    listVM.messageList.valueHasMutated();
});
check('The mixed-order control is absent from Inbox search results', await page.evaluate(() =>
    document.querySelector('.pw-unread-order').hidden));
await page.evaluate(() => {
    listVM.messageList().search = '';
    listVM.messageList().folder = 'Trash';
    listVM.messageList.valueHasMutated();
});
check('The control is absent outside Inbox', await page.evaluate(() =>
    document.querySelector('.pw-unread-order').hidden));

await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?drafts=1&mode=list&side=1&shell=1&threads=1&unreadOrder=1');
await page.waitForSelector('.pw-draft-row');
await page.waitForFunction(() => [...document.querySelectorAll('.pw-draft-row')].map(row => row.dataset.uid).join(',') === '3,2');
check('Unread drafts use their true oldest-first server page', await page.evaluate(() =>
    [...document.querySelectorAll('.pw-draft-row')].map(row => row.dataset.uid).join(',') === '3,2'));
check('Draft and received ordering stays independent from Conversations', await page.evaluate(() =>
    document.querySelector('.pw-unread-order').getAttribute('aria-pressed') === 'true'
    && document.querySelector('.pw-threads').getAttribute('aria-pressed') === 'true'));

await page.setViewportSize({width: 390, height: 844});
await page.waitForFunction(() => document.querySelector('.pw-feed-settings')?.closest('.pw-mobile-list-tools'));
check('The cumulative controls fit the mobile timeline header', await page.evaluate(() => {
    const group = document.querySelector('.pw-feed-settings'), rect = group.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth
        && [...group.querySelectorAll('button')].every(control => control.getBoundingClientRect().width >= 32);
}));

await page.setViewportSize({width: 1200, height: 900});
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&unreadOrder=1&unreadBehavior=2');
await page.waitForFunction(() => document.querySelector('.pw-unread-order')?.getAttribute('aria-busy') === 'false');
await page.waitForFunction(() => listVM.messageList().map(message => message.uid).join(',') === '5,3,2,1,4,6,7,8,9,10');
await page.evaluate(() => {
    const scroller = document.querySelector('#V-MailMessageList .messageList > .b-content');
    scroller.style.height = '220px'; scroller.style.overflow = 'auto';
    scroller.style.position = 'relative'; scroller.style.overflowAnchor = 'none';
    void scroller.offsetHeight; scroller.scrollTo({top:80, behavior:'instant'});
    readerVM.message(listVM.messageList().find(message => message.uid === 3));
});
await page.evaluate(() => listVM.messageList().find(message => message.uid === 3).isUnseen(false));
await page.waitForTimeout(100);
check('Mode 2 pins the open message after it becomes read', await page.evaluate(() =>
    listVM.messageList().map(message => message.uid).join(',') === '5,3,2,1,4,6,7,8,9,10'));
await page.evaluate(() => {
    const scroller = document.querySelector('#V-MailMessageList .messageList > .b-content');
    const nativeScrollTo = scroller.scrollTo.bind(scroller);
    window.anchorScrollCalls = [];
    scroller.scrollTo = options => { anchorScrollCalls.push(options); nativeScrollTo(options); };
    scroller.scrollTo({top:150, behavior:'instant'});
});
await page.waitForTimeout(50);
const anchoredTop = await page.evaluate(() => {
    const next = listVM.messageList().find(message => message.uid === 2);
    return [...document.querySelectorAll('.fixture-list > .messageListItem')]
        .find(row => ko.dataFor(row) === next).getBoundingClientRect().top;
});
await page.evaluate(() => readerVM.message(listVM.messageList().find(message => message.uid === 2)));
await page.waitForFunction(() => listVM.messageList().map(message => message.uid).join(',') === '5,2,1,3,4,6,7,8,9,10');
await page.waitForFunction(() => anchorScrollCalls.length > 1);
check('Mode 2 reorders the previous message only after it is left', await page.evaluate(() =>
    listVM.messageList().map(message => message.uid).join(',') === '5,2,1,3,4,6,7,8,9,10'));
check('Mode 2 keeps the newly opened row at the same viewport position', Math.abs(anchoredTop - await page.evaluate(() => {
    const current = listVM.messageList().find(message => message.uid === 2);
    return [...document.querySelectorAll('.fixture-list > .messageListItem')]
        .find(row => ko.dataFor(row) === current).getBoundingClientRect().top;
})) < 1.5);
await page.evaluate(() => listVM.messageList().find(message => message.uid === 5).isUnseen(false));
await page.waitForFunction(() => listVM.messageList().map(message => message.uid).join(',') === '2,1,3,4,5,6,7,8,9,10');
check('Mode 2 still reorders a non-open message immediately', await page.evaluate(() =>
    listVM.messageList().map(message => message.uid).join(',') === '2,1,3,4,5,6,7,8,9,10'));

await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=settings&unreadOrder=1');
await page.waitForFunction(() => !document.querySelector('.pw-unread-order-setting select')?.disabled);
check('General settings exposes the per-account choice with mode 1 selected by default', await page.evaluate(() => {
    const control = document.querySelector('.pw-unread-order-setting'), select = control?.querySelector('select');
    const legends = [...document.querySelectorAll('#V-Settings-General .legend')];
    return !!control && select.value === '1' && select.options.length === 2
        && control.nextElementSibling === legends[2]
        && control.textContent.includes('Non lus : anciens d’abord');
}));
await page.selectOption('.pw-unread-order-setting select', '2');
await page.waitForFunction(() => unreadOrderBehavior === 2 && !document.querySelector('.pw-unread-order-setting select').disabled);
check('Changing the choice persists mode 2 without changing the order toggle', await page.evaluate(() =>
    unreadOrderRequests.at(-1)?.behavior === 2 && unreadOrderEnabled
    && document.querySelector('.pw-unread-order-setting select').value === '2'));
await page.setViewportSize({width: 390, height: 844});
check('The setting remains inside the mobile viewport', await page.evaluate(() => {
    const rect = document.querySelector('.pw-unread-order-setting select').getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth;
}));
await page.evaluate(() => { unreadOrderFailure = true; });
await page.selectOption('.pw-unread-order-setting select', '1');
await page.waitForFunction(() => document.querySelector('.pw-unread-order-setting-status')?.textContent.includes('Impossible'));
check('A failed behavior write restores the saved choice and reports the error', await page.evaluate(() =>
    document.querySelector('.pw-unread-order-setting select').value === '2'
    && PiedWebUx.unreadOrder.behavior() === 2));

await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&unreadOrder=0');
await page.waitForFunction(() => document.querySelector('.pw-unread-order')?.getAttribute('aria-busy') === 'false');
await page.evaluate(() => { unreadOrderFailure = true; });
await page.locator('.pw-unread-order').click();
await page.waitForFunction(() => document.querySelector('.pw-unread-order-error')?.textContent.includes('Impossible'));
check('A failed preference write keeps the previous order and exposes a retryable error', await page.evaluate(() =>
    document.querySelector('.pw-unread-order').getAttribute('aria-pressed') === 'false'
    && !document.querySelector('.pw-unread-order').disabled
    && !document.querySelector('.pw-unread-order-error').hidden));
check('No runtime errors', await page.evaluate(() => fixtureErrors.length === 0));

console.log(JSON.stringify({passed:checks.length, checks}, null, 2));
