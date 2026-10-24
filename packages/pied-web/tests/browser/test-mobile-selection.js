// Exercise browser context-menu cancellation as well as an uninterrupted hold.
const page = await browser.getPage('nextsnapmail-mobile-selection');
page.setDefaultTimeout(6000);
await page.bringToFront();
const checks = [];
const check = (name, ok) => { if (!ok) throw Error(name); checks.push(name); console.log('PASS ' + name); };
await page.setViewportSize({width:390,height:844});
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1',{waitUntil:'domcontentloaded',timeout:15000});
await page.waitForFunction(() => document.querySelector('.pw-selection-bar'));
await page.evaluate(async () => {
    // Use the installed engine's actual menu bindings and read/unread dispatch.
    // Only the collection/flag transport is fictional, as in the shared fixture.
    const core = '/app/snappymail/v/2.38.2/';
    const source = await (await fetch(core + 'static/js/app.js')).text();
    const action = source.slice(source.indexOf('listAction = (folder, action, messages)'),source.indexOf('moveMessagesToFolderType = (toFolderType, bDelete)')).trim().replace(/,$/,'');
    const methods = ['listSetSeen','listUnsetSeen'].map(name => source.match(new RegExp(name + '\\(\\) \\{[\\s\\S]*?\\n\\t\\t\\}'))[0]);
    messageList.listChecked = () => messageList().filter(m => m.checked());
    messageList.listCheckedOrSelected = () => { const checked = messageList.listChecked(); return checked.length ? checked : [listVM.selector.selectedItem()].filter(Boolean); };
    messageList.hasCheckedOrSelected = ko.computed(() => messageList.listCheckedOrSelected().length);
    Object.assign(listVM,new Function('MessagelistUserStore','FolderUserStore','MessageSetAction',
        'const ' + action + '; return {' + methods.join(',') + '};')(messageList,{currentFolderFullName:() => messageList().folder},{SetSeen:0,UnsetSeen:1}));
    const html = await (await fetch(core + 'app/templates/Views/User/MailMessageList.html')).text();
    const template = new DOMParser().parseFromString(html,'text/html');
    const menu = document.querySelector('[aria-labelledby="more-list-dropdown-id"]');
    for (const [method,label] of [['listUnsetSeen','Marquer comme non lu'],['listSetSeen','Marquer comme lu']]) {
        const row = document.importNode(template.querySelector('[data-bind^="click: ' + method + ',"]'),true);
        row.querySelector('a').textContent = label;
        menu.querySelector('[data-i18n="MESSAGE_LIST/MENU_' + (method==='listSetSeen' ? 'SET' : 'UNSET') + '_SEEN"]').closest('li').replaceWith(row);
        ko.applyBindingAccessorsToNode(row,{click:()=>listVM[method],css:()=>({disabled:!messageList.hasCheckedOrSelected()})},listVM);
    }
    const trigger = document.querySelector('#more-list-dropdown-id');
    trigger.addEventListener('click',event => { event.preventDefault(); trigger.parentElement.classList.toggle('show'); menu.classList.toggle('show'); });
    menu.addEventListener('click',() => { trigger.parentElement.classList.remove('show'); menu.classList.remove('show'); });
    window.selectionOpens = 0;
    demoRows.forEach(row => row.addEventListener('click',() => ++selectionOpens));
    demoMessages.forEach(m => m.isUnseen(false));
});
const gesture = options => page.evaluate(async ({context,cancel,move,hold=0,releaseRow=1}) => {
    const part=demoRows[1].querySelector('.subjectParent'),r=part.getBoundingClientRect(),x=r.x+8,y=r.y+8;
    const pointer = type => part.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true,pointerId:91,clientX:x,clientY:y}));
    pointer('pointerdown');
    if (move) part.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:91,clientX:x,clientY:y+14}));
    if (hold) await new Promise(resolve => setTimeout(resolve,hold));
    if (context) part.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));
    pointer(cancel ? 'pointercancel' : 'pointerup');
    if (!move) demoRows[releaseRow].querySelector('.subjectParent').click();
},options);
const selected = () => page.evaluate(() => demoMessages[1].checked() && demoMessages.filter(m=>m.checked()).length===1 && !document.querySelector('.pw-selection-bar').hidden && selectionOpens===0);
await gesture({context:true,cancel:true});
check('A native context menu before 550ms commits selection despite pointer cancellation',await selected());
for (const [method,unread] of [['listUnsetSeen',true],['listSetSeen',false]]) {
    await page.locator('#more-list-dropdown-id').click();
    await page.locator('[aria-labelledby="more-list-dropdown-id"] [data-bind^="click: ' + method + ',"] a').click();
    check('Native menu dispatches ' + method + ' only to the held row',await page.evaluate(unread => {
        const call=fixtureSeenActions.at(-1);
        return call.folder==='INBOX' && call.uids.join() === '2' && call.action === (unread ? 1 : 0)
            && demoMessages[1].isUnseen() === unread && demoMessages.filter(m=>m.isUnseen()).length === (unread ? 1 : 0);
    },unread));
}
for (const property of ['messageList','groupedList','listGrouped']) {
    await page.evaluate(property => {
        // Recreate a list-owned heading with the real Knockout foreach. Its
        // removal must not dispose the native controls parked inside it.
        const dom=document.querySelector('#V-MailMessageList'),owner=document.createElement('div');
        owner.innerHTML='<div class="groupLabel" data-bind="text: label"></div>';
        dom.querySelector('.b-content').append(owner);
        const source=listVM[property],groups=ko.computed(()=>{source();return [{label:'Aujourd’hui'}];});
        ko.applyBindingAccessorsToNode(owner,{foreach:()=>groups},listVM);
        const tools=dom.querySelector('.pw-mobile-list-tools');
        owner.firstElementChild.append(tools);
        window.selectionDisposed=0;
        ko.utils.domNodeDisposal.addDisposeCallback(tools,()=>++selectionDisposed);
        const current=source();
        source(Array.isArray(current) ? Object.assign(current.slice(),{folder:current.folder,search:current.search}) : !current);
        groups.dispose();ko.removeNode(owner);
    },property);
    await page.waitForFunction(()=>document.querySelector('#more-list-dropdown-id')?.getClientRects().length);
    check('Native controls survive Knockout disposal after ' + property,await page.evaluate(()=>selectionDisposed===0
        && ko.dataFor(document.querySelector('[data-bind^="click: listUnsetSeen,"]'))===listVM));
    const before=await page.evaluate(()=>fixtureSeenActions.length);
    await page.locator('#more-list-dropdown-id').click();
    await page.locator('[aria-labelledby="more-list-dropdown-id"] [data-bind^="click: listUnsetSeen,"] a').click();
    check('Read/unread still dispatches after ' + property,await page.evaluate(before=>fixtureSeenActions.length===before+1
        && fixtureSeenActions.at(-1).uids.join()==='2',before));
}
await page.evaluate(()=>listVM.listGrouped(true));
await page.waitForFunction(()=>document.querySelectorAll('#V-MailMessageList .pw-day-label').length===0);
check('Switching to native grouped rows removes stale date headings',await page.evaluate(()=>
    document.querySelector('#V-MailMessageList .pw-mobile-list-tools')?.isConnected));
await page.evaluate(()=>listVM.listGrouped(false));
await page.waitForFunction(()=>document.querySelectorAll('#V-MailMessageList .pw-day-label').length>0);
check('Returning to the flat list recreates date headings around the same controls',await page.evaluate(()=>
    document.querySelector('#V-MailMessageList .pw-mobile-list-tools')?.isConnected));
const fits = () => page.evaluate(() => {
    const bar=document.querySelector('.pw-selection-bar'),count=bar.querySelector('.pw-selection-count'),finish=bar.querySelector('.pw-selection-finish');
    return [...bar.querySelectorAll('button,.checkboxCheckAll,.pw-selection-count')].filter(el=>el.getClientRects().length)
        .every(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})
        && count.clientWidth>60 && finish.getBoundingClientRect().height>=44;
});
for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    check('Partial selection hides all-pages and keeps count/Done reachable at ' + width,await page.evaluate(() => !document.querySelector('.pw-filtered-selection').getClientRects().length) && await fits());
    await page.locator('.checkboxCheckAll').press('Space');
    check('All-pages control wraps without pushing Done off screen at ' + width,await fits());
    await page.locator('.pw-selection-finish').click();
    check('Done clears the complete selection at ' + width,await page.evaluate(() => demoMessages.every(m=>!m.checked())));
    await gesture({context:true,hold:650});
    check('Timer plus contextmenu toggles once and suppresses the release click at ' + width,await selected());
}
await page.locator('.pw-selection-finish').click();
await gesture({hold:650,cancel:true});
check('Cancellation after the timer preserves selection and suppresses compatibility click',await selected());
await page.locator('.pw-selection-finish').click();
await gesture({hold:650,releaseRow:0});
check('A compatibility click displaced by the selection bar cannot select a neighbour',await selected());
await page.locator('.messageListItem .subjectParent').first().click();
check('A new intentional tap immediately adds the neighbouring row',await page.evaluate(()=>demoMessages[0].checked()&&demoMessages[1].checked()&&demoMessages.filter(m=>m.checked()).length===2));
await page.locator('.pw-selection-finish').click();
const held=page.locator('.messageListItem .subjectParent').nth(1);
await held.scrollIntoViewIfNeeded();
const box=await held.boundingBox(),cdp=await page.context().newCDPSession(page);
try {
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+10,y:box.y+10}]});
    await page.waitForTimeout(750);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);
    check('Chrome touch release keeps exactly the held message despite row movement',await selected());
} finally {
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
}
await page.locator('.pw-selection-finish').click();
await gesture({context:true,cancel:true,move:true});
check('Scrolling never becomes a long-press selection',await page.evaluate(() => demoMessages.every(m=>!m.checked())));
await page.evaluate(() => demoRows[1].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2})));
check('A desktop context menu alone does not select mail',await page.evaluate(() => demoMessages.every(m=>!m.checked())));
check('No runtime errors',await page.evaluate(() => fixtureErrors.length===0));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
