const page = await browser.getPage('nextsnapmail-mailbox-workspace');
page.setDefaultTimeout(10000);
await page.setViewportSize({width:1440,height:900});
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=2');
await page.waitForFunction(() => window.PiedWebUx?.mailbox && document.querySelectorAll('.pw-global-row').length === 5);
const checks=[];
const check=(name,pass)=>{if(!pass)throw Error(name);checks.push(name);console.log('PASS '+name);};

check('All my accounts lives in the account menu while the folder rail keeps only the account Feed',await page.evaluate(() =>
    document.querySelector('.pw-global-nav')?.parentElement === document.querySelector('#V-SystemDropDown menu')
    && !document.querySelector('.b-folders-system .pw-global-nav')
    && document.querySelector('.pw-list-scope-label').textContent === 'Tous mes comptes'));

await page.locator('.pw-global-row').first().focus();
await page.keyboard.press('ArrowDown');
check('Global keyboard navigation moves focus immediately with a visible outline',await page.evaluate(() => {
    const rows=[...document.querySelectorAll('.pw-global-row')],focused=document.activeElement;
    return focused===rows[1] && focused.classList.contains('focused')
        && getComputedStyle(focused).outlineWidth==='2px';
}));
await page.keyboard.press('Space');
check('Space toggles only the focused global message',await page.evaluate(() =>
    document.querySelectorAll('.pw-global-row.checked').length===1
    && document.querySelector('.pw-global-selection [role="status"]').textContent.includes('1 message')));
await page.keyboard.press('Escape');
check('Escape leaves global selection without opening a hidden native message',await page.evaluate(() =>
    !document.querySelector('.pw-global-row.checked') && !location.hash.includes('/m')));

const stable = await page.evaluate(() => { window.firstGlobalNode=document.querySelector('.pw-global-row'); return firstGlobalNode.dataset.fixture='stable'; });
await page.evaluate(() => PiedWebUx.feed.refreshGlobal());
await page.waitForFunction(() => feedRequests.filter(request=>request.operation==='global').length>=2);
check('Refreshing unchanged data preserves keyed row DOM and focusable identity',stable==='stable' && await page.evaluate(() =>
    document.querySelector('.pw-global-row')===firstGlobalNode && firstGlobalNode.dataset.fixture==='stable'));

const input=page.locator('#V-MailMessageList .inputSearch');
await input.fill('projet');
await input.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.pw-global-row').length===50
    && document.querySelector('.pw-global-status').textContent.includes('125'));
check('Server search spans all authorized accounts with explicit scope and stable pagination',await page.evaluate(() => {
    const call=mailboxFixtureCalls.find(request=>request.operation==='search');
    return call?.scope==='all' && !Object.hasOwn(call,'accountHashes')
        && document.querySelector('.pw-global-pager').textContent.includes('1 / 3')
        && document.querySelector('.pw-global-status').textContent.includes('Corbeille et Indésirables exclus');
}));
const firstPageUid=await page.evaluate(()=>document.querySelector('.pw-global-row').pwItem.uid);
await page.getByRole('button',{name:'Suivant'}).click();
await page.waitForFunction(uid => document.querySelector('.pw-global-row')?.pwItem.uid!==uid,firstPageUid);
check('Next page reuses the frozen server search token',await page.evaluate(() => {
    const calls=mailboxFixtureCalls.filter(request=>request.operation==='search');
    return calls.at(-1).offset===50 && /^search-/.test(calls.at(-1).searchToken);
}));

await input.fill('aucun-resultat');
await input.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.pw-global-row').length===0
    && document.querySelector('.pw-global-status').textContent.includes('0 résultat'));
check('An empty server result is announced without falling back to stale Feed rows',await page.evaluate(() =>
    document.querySelector('.pw-global-status').textContent.includes('0 résultat')));

await input.fill('projet');
await input.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.pw-global-row').length===50);
check('All-pages selection stays hidden until the page checkbox is selected',await page.evaluate(() =>
    document.querySelector('.pw-global-selection button').hidden));
await page.locator('.pw-global-selection input[type="checkbox"]').check();
check('The page and all-pages choices share one progressive selection control',await page.evaluate(() =>
    !document.querySelector('.pw-global-selection button').hidden
    && document.querySelector('.pw-global-selection input[type="checkbox"]').checked));
await page.getByRole('button',{name:/Sélectionner les 125 résultats/}).click();
await page.waitForFunction(() => document.querySelector('.pw-global-selection [role="status"]').textContent.includes('125'));
check('Select all results freezes every page and states the exact message count',await page.evaluate(() => {
    const call=mailboxFixtureCalls.filter(request=>request.operation==='prepare').at(-1);
    return /^search-/.test(call.searchToken)
        && document.querySelector('.pw-global-selection input[type="checkbox"]').checked
        && document.querySelector('.pw-global-status').textContent.includes('125 messages, toutes pages incluses');
}));
await page.getByRole('button',{name:'Supprimer',exact:true}).first().click();
await page.waitForFunction(() => document.querySelector('.pw-mailbox-notice')?.hidden===false
    && document.querySelector('.pw-mailbox-notice button')?.hidden===false);
check('Confirmed multi-page Trash exposes Undo only after the server reports completion',await page.evaluate(() => {
    const actions=mailboxFixtureCalls.filter(request=>request.operation==='action');
    return actions.length && actions.at(-1).action==='trash'
        && document.querySelector('.pw-mailbox-notice').textContent.includes('125 message(s) mis à la corbeille')
        && !document.querySelector('.pw-mailbox-notice button').hidden;
}));
await page.getByRole('button',{name:'Annuler',exact:true}).click();
await page.waitForFunction(() => mailboxFixtureCalls.some(request=>request.operation==='undo')
    && document.querySelector('.pw-mailbox-notice')?.textContent.includes('restauré'));
check('Undo restores the mapped server snapshot instead of replaying stale source UIDs',await page.evaluate(() =>
    mailboxFixtureCalls.filter(request=>request.operation==='undo').length===1
    && document.querySelector('.pw-mailbox-notice').textContent.includes('125 message(s) restauré(s)')));

await input.fill('');
await input.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.pw-global-row').length===5);
const threadedRow=page.locator('.pw-global-row').filter({hasText:'Conversation à reprendre'});
await threadedRow.hover();
check('Flag, Trash and Reminder form one reserved action rail without covering row text',await threadedRow.evaluate(row => {
    const group=row.querySelector('.pw-row-actions'),subject=row.querySelector('.pw-global-subject');
    const buttons=[...group.querySelectorAll('button')];
    return buttons.length===3&&buttons[0].classList.contains('pw-flag-action')
        &&buttons[1].dataset.pwRowIcon==='trash-2'&&buttons[2].classList.contains('pw-remind-action')
        &&subject.getBoundingClientRect().right<=group.getBoundingClientRect().left;
}));
await threadedRow.locator('.pw-flag-action').click();
await page.waitForFunction(() => mailboxFixtureCalls.some(request=>request.operation==='action'&&request.action==='flag'));
check('The global flag action reaches the account-safe mailbox endpoint',await page.evaluate(() =>
    mailboxFixtureCalls.some(request=>request.operation==='action'&&request.action==='flag')));
await threadedRow.hover();
const trashActions=await page.evaluate(() => mailboxFixtureCalls.filter(request=>request.operation==='action'&&request.action==='trash').length);
await threadedRow.locator('.pw-row-action[aria-label="Supprimer"]').click();
await page.waitForFunction(before => mailboxFixtureCalls.filter(request=>request.operation==='action'&&request.action==='trash').length>before,trashActions);
check('A quick row action sends every UID in the exact account/folder/UIDVALIDITY thread scope and does not open the row',await page.evaluate(() => {
    const call=mailboxFixtureCalls.filter(request=>request.operation==='prepare').at(-1),items=JSON.parse(call.items||'[]');
    return items.length===2 && items.every(item=>item.accountHash&&item.folder==='INBOX'&&item.uidValidity===77)
        && items.map(item=>item.uid).sort((a,b)=>a-b).join(',')==='99,102'
        && document.querySelectorAll('.pw-global-row .pw-row-actions').length===1
        && !location.hash.includes('/m') && sessionStorage.getItem('pw-mail-feed-open')===null;
}));

check('Workspace run has no fixture runtime error',await page.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
