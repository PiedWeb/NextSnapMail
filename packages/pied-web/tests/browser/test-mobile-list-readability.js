// Exercise the real coarse-pointer media query: resizing a desktop page alone
// missed the action rail consuming most of the sender and subject width.
const page = await browser.getPage('nextsnapmail-mobile-list-readability');
page.setDefaultTimeout(7000);
const cdp = await page.context().newCDPSession(page);
const checks = [];
const check = (name, ok) => { if (!ok) throw Error(name); checks.push(name); console.log('PASS ' + name); };
const url = 'http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=1&feedDefault=inbox';
const open = async () => {
    await page.goto(url);
    await page.waitForSelector('.messageListItem > .pw-row-actions');
    await page.evaluate(async () => {
        await document.fonts.ready;
        const row = demoRows[0];
        row.querySelector('.senderParent').textContent = 'Camille Martin — Association des voyageurs';
        row.querySelector('.subjectParent').textContent = 'Re: Préparation du prochain séjour : hébergements, transports et rendez-vous du groupe';
        row.querySelector('time').textContent = 'Aujourd’hui à 11:29';
        const count = document.createElement('div');
        count.className = 'threads-len'; count.textContent = '13/4'; count.dataset.unseen = '4';
        row.querySelector('.subjectParent').after(count);
        row.querySelector('.attachmentParent').innerHTML = '<i class="icon-attachment"></i>';
    });
    await page.waitForSelector('.threads-len[data-pw-total]');
};
const readable = () => page.evaluate(() => {
    const row = demoRows[0], box = row.getBoundingClientRect();
    const sender = row.querySelector('.senderParent').getBoundingClientRect();
    const subject = row.querySelector('.subjectParent').getBoundingClientRect();
    const parts = [...row.querySelectorAll('time,.threads-len,.attachmentParent,.pw-row-actions')].map(node => node.getBoundingClientRect());
    const overlap = (a,b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    return document.documentElement.scrollWidth <= innerWidth
        && sender.width >= box.width - 60 && Math.abs(sender.width - subject.width) < 1
        && subject.height <= 2*parseFloat(getComputedStyle(row.querySelector('.subjectParent')).lineHeight)+1
        && (innerWidth>390 || subject.height>parseFloat(getComputedStyle(row.querySelector('.subjectParent')).lineHeight))
        && parts.every((part,i) => part.top >= subject.bottom - 1 && part.bottom <= box.bottom + 1
            && part.left >= box.left && part.right <= box.right
            && parts.slice(i+1).every(other => !overlap(part,other)))
        && [...row.querySelector('.pw-row-actions').children].every(node => {
            const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
            return r.width >= 43.9 && r.height >= 43.9 && node.contains(hit);
        });
});
try {
    await page.goto(url);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    for (const coarse of [false,true]) {
        await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:coarse,maxTouchPoints:1});
        for (const dark of [false,true]) for (const width of (coarse ? [320,360,390,600,799,800,1280] : [320,360,390,600,799])) {
            await page.setViewportSize({width,height:900});
            await page.emulateMedia({colorScheme:dark ? 'dark' : 'light'});
            await open();
            check(`Full-width sender/subject and distinct footer hit targets: ${width}px, ${coarse?'touch':'mouse'}, ${dark?'dark':'light'}`,await readable());
            if (coarse && width===320 && !dark) console.log(await saveScreenshot(await page.screenshot(),'mail-list-320-after.png'));
        }
    }
    await page.setViewportSize({width:320,height:1100});
    await page.emulateMedia({colorScheme:'light'});
    await open();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    check('200% text wraps the date without collisions or horizontal scrolling',await readable());
    check('Enlarged dates keep a complete line instead of breaking words beside the actions',await page.evaluate(() => {
        const row=demoRows[0],date=row.querySelector('time').getBoundingClientRect();
        return date.height<40;
    }));
    console.log(await saveScreenshot(await page.screenshot(),'mail-list-320-text-200-after.png'));

    // Controls keep their bound commands. Import the actual engine dispatcher;
    // only the flag transport and mailbox endpoint remain fictional.
    await page.setViewportSize({width:390,height:900});
    await open();
    await page.evaluate(async () => {
        const source = await (await fetch('/app/snappymail/v/2.38.2/static/js/app.js')).text();
        const start = source.indexOf("this.selector.on('click', (event, currentMessage) => {");
        const end = source.indexOf("\n\t\t\tthis.selector.on('UpOrDown'",start);
        if (start<0 || end<0) throw Error('Native selector contract changed');
        window.mobileFlagActions = [];
        demoMessages.forEach(message => { message.flagged=false; message.isFlagged=()=>message.flagged; });
        const store = {listCheckedOrSelected:()=>demoMessages.filter(message=>message.checked())};
        const action = (folder,action,messages) => {
            mobileFlagActions.push({folder,action,uids:messages.map(message=>message.uid)});
            messages.forEach(message=>{message.flagged=action==='set';});
        };
        let click;
        Function('MessagelistUserStore','MessageSetAction','listAction',source.slice(start,end))
            .call({selector:{on:(name,fn)=>click=fn},gotoThread(){}},store,{SetFlag:'set',UnsetFlag:'unset'},action);
        demoRows.forEach((row,i)=>row.addEventListener('click',event=>click(event,demoMessages[i])));
    });
    const tap = async selector => {
        const r = await page.locator(selector).first().boundingBox();
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});
        await page.waitForTimeout(80);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    await tap('.messageListItem .flagParent');
    await page.waitForFunction(()=>mobileFlagActions.length>0);
    check('A touch on the star reaches the native flag command for exactly its message',await page.evaluate(() =>
        mobileFlagActions.length===1 && mobileFlagActions[0].folder==='INBOX' && mobileFlagActions[0].uids.join()==='1'));
    await tap('.messageListItem .pw-remind-action');
    await page.waitForSelector('.pw-reminder-panel');
    await page.locator('.pw-reminder-option').first().press('Escape');
    check('Reminder cancellation returns focus to the visible row trigger',await page.evaluate(() =>
        !document.querySelector('.pw-reminder-panel') && document.activeElement===demoRows[0].querySelector('.pw-remind-action')));
    await page.evaluate(() => { mailboxFixtureFailure='changed'; });
    await tap('.messageListItem [data-pw-row-icon="trash-2"]');
    await page.waitForFunction(() => document.querySelector('.pw-mailbox-notice')?.dataset.state==='error');
    check('A refused touch Trash restores its row and preserves its exact native identity',await page.evaluate(() => {
        const call=mailboxFixtureCalls.find(call=>call.operation==='prepare');
        return call.folder==='INBOX' && call.uids==='[1]' && !demoRows[0].classList.contains('pw-row-pending')
            && ko.dataFor(demoRows[0])===demoMessages[0] && listVM.selector.selectedItem()===demoMessages[0];
    }));
    check('The row workflow has no runtime error',await page.evaluate(()=>fixtureErrors.length===0));

    await open();
    const subjectBox=await page.locator('.messageListItem .subjectParent').first().boundingBox();
    const contentLeft=await page.locator('.messageListItem > div + div').first().evaluate(node=>node.getBoundingClientRect().left);
    const swipeStart={x:subjectBox.x+30,y:subjectBox.y+10};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[swipeStart]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...swipeStart,x:swipeStart.x+40}]});
    check('Swipe feedback still translates the native content wrapper',await page.locator('.messageListItem > div + div').first()
        .evaluate((node,left)=>node.getBoundingClientRect().left>=left+35,contentLeft));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    check('A short swipe cancels without moving any message',await page.evaluate(()=>!fixtureMoves.length && !mailboxFixtureCalls.length));

    // Without mounted quick actions (for example Trash), the original star
    // must still fit the native row; no node was cloned.
    await open();
    await page.evaluate(() => {
        rl.app.mailboxFolders=()=>({trash:'Trash'});
        demoMessages[0].folder='Trash';
        window.keptStar=demoRows[0].querySelector('.flagParent');
        const group=demoRows[0].querySelector('.pw-row-actions');
        demoRows[0].querySelector('.senderParent').before(keptStar);
        group.remove(); demoRows[0].classList.remove('pw-has-row-actions');
    });
    check('Native fallback keeps the original star reachable below full-width text',await page.evaluate(() => {
        const sender=demoRows[0].querySelector('.senderParent').getBoundingClientRect();
        const subject=demoRows[0].querySelector('.subjectParent').getBoundingClientRect(),star=keptStar.getBoundingClientRect();
        return keptStar.isConnected && Math.abs(sender.width-subject.width)<1 && star.top>=subject.bottom && star.width>=43.9;
    }));
    await open();
    await page.evaluate(() => {
        // Native MessageModel.indent() sets this inline margin for replies.
        const content=demoRows[0].querySelector(':scope > div + div');
        content.style.marginLeft='2em'; content.classList.add('reply');
    });
    check('Native reply indentation keeps subjects and footer controls inside the row',await page.evaluate(() => {
        const row=demoRows[0].getBoundingClientRect();
        return [...demoRows[0].querySelectorAll('.subjectParent,time,.threads-len,.attachmentParent,.pw-row-actions')]
            .every(node=>node.getBoundingClientRect().right<=row.right);
    }));

    for (const width of [320,390,800,1280]) {
        await page.setViewportSize({width,height:900});
        await page.goto(url.replace('accounts=1&feedDefault=inbox','accounts=2'));
        await page.waitForSelector('.pw-global-row');
        await page.evaluate(() => { document.querySelector('.pw-global-primary').textContent='Camille Martin — Association des voyageurs'; });
        check(`Global Feed account identity leaves the sender the complete width at ${width}px`,await page.evaluate(() => {
            const row=document.querySelector('.pw-global-row'),sender=row.querySelector('.pw-global-primary').getBoundingClientRect();
            const subject=row.querySelector('.pw-global-subject').getBoundingClientRect(),account=row.querySelector('.pw-global-account').getBoundingClientRect();
            return Math.abs(sender.width-subject.width)<1 && sender.width>=row.getBoundingClientRect().width-50 && account.top>=subject.bottom;
        }));
        if (width===390) console.log(await saveScreenshot(await page.screenshot(),'mail-global-390-after.png'));
    }
} finally {
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp.detach();
}
console.log(JSON.stringify({passed:checks.length,checks},null,2));
