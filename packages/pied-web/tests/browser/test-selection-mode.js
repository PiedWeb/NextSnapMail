const p=await browser.getPage('nextsnapmail-selection-mode');p.setDefaultTimeout(6000);
await p.setViewportSize({width:1440,height:900});await p.emulateMedia({colorScheme:'light'});
await p.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&listOnly=1');
await p.waitForFunction(()=>document.querySelector('#V-MailMessageList')?.dataset.pwSelectionVersion==='1.7.15');
await p.evaluate(()=>{window.fixtureRowOpens=[];demoRows.forEach((row,i)=>row.addEventListener('click',()=>fixtureRowOpens.push(i+1)));});
const results=[];const check=(name,ok)=>{if(!ok)throw new Error(name);results.push(name);console.log('PASS '+name);};
check('Only the page-wide checkbox appears at rest',await p.evaluate(()=>{
 const list=document.querySelector('#V-MailMessageList');
 return !list.classList.contains('pw-selection-mode')&&list.querySelector('.pw-selection-bar').hidden
   &&[...list.querySelectorAll('.messageCheckbox')].every(x=>getComputedStyle(x).display==='none')
   &&getComputedStyle(list.querySelector('.checkboxCheckAll')).display!=='none'
   &&list.querySelector('.checkboxCheckAll').getAttribute('role')==='checkbox'
   &&list.querySelector('.checkboxCheckAll').getAttribute('aria-label')==='Sélectionner les éléments de cette page'
   &&!list.querySelector('.pw-select-results').getClientRects().length;
}));
await p.locator('.messageListItem').first().hover();
check('Native Flag, Trash and Reminder share a reserved rail with a real bin icon',await p.evaluate(()=>{
 const row=document.querySelector('.messageListItem'),group=row.querySelector(':scope > .pw-row-actions');
 const trash=group?.querySelector('[data-pw-row-icon="trash-2"]'),subject=row.querySelector('.subjectParent');
 return group?.firstElementChild?.classList.contains('flagParent')&&group.children.length===3
  &&trash&&!trash.textContent.trim()&&getComputedStyle(trash,'::before').maskImage!=='none'
  &&subject.getBoundingClientRect().right<=group.getBoundingClientRect().left;
}));
await p.locator('.checkboxCheckAll').press('Space');
check('Keyboard Space selects the current page immediately',await p.evaluate(()=>demoMessages.every(message=>message.checked())
 &&document.querySelector('.checkboxCheckAll').getAttribute('aria-checked')==='true'
 &&document.querySelector('.checkboxCheckAll').parentElement.classList.contains('pw-selection-bar')
 &&!document.querySelector('.pw-select-results').hidden));
await p.locator('.checkboxCheckAll').press('Space');
check('The same checkbox remains available and deselects the page',await p.evaluate(()=>demoMessages.every(message=>!message.checked())
 &&document.querySelector('.pw-selection-bar').hidden
 &&document.querySelector('.checkboxCheckAll').getAttribute('aria-checked')==='false'));
await p.locator('.checkboxCheckAll').press('Space');
await p.locator('.pw-selection-finish').click();
await p.locator('.messageListItem .senderParent').nth(2).click();
check('Ordinary click keeps the native open behavior',await p.evaluate(()=>fixtureRowOpens.join(',')==='3'&&demoMessages.every(m=>!m.checked())));
await p.evaluate(()=>demoRows[0].querySelector('.senderParent').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));
check('Ctrl-click keeps the open message and adds the clicked message to selection',await p.evaluate(()=>demoMessages[0].checked()&&demoMessages[2].checked()&&demoMessages.filter(m=>m.checked()).length===2&&document.querySelector('.pw-selection-count').textContent==='2 messages sélectionnés'&&fixtureRowOpens.join(',')==='3'));
await p.locator('.messageListItem .senderParent').nth(1).click();
check('Further plain clicks add messages to the selection',await p.evaluate(()=>demoMessages.slice(0,3).every(m=>m.checked())&&demoMessages.filter(m=>m.checked()).length===3&&document.querySelector('.pw-selection-count').textContent==='3 messages sélectionnés'&&fixtureRowOpens.join(',')==='3'));
await p.locator('.messageListItem .senderParent').first().click();
check('Tapping a selected row removes only that message',await p.evaluate(()=>!demoMessages[0].checked()&&demoMessages[1].checked()&&demoMessages[2].checked()&&fixtureRowOpens.join(',')==='3'));
await p.locator('.pw-read-toggle').first().click();
check('The read-status dot remains independent in selection mode',await p.evaluate(()=>fixtureSeenActions.length===1&&demoMessages[1].checked()&&demoMessages[2].checked()&&!demoMessages[0].checked()));
await p.locator('.pw-selection-finish').click();
check('Done clears checked state and returns to normal mode',await p.evaluate(()=>demoMessages.every(m=>!m.checked())&&document.querySelector('.pw-selection-bar').hidden));
await p.evaluate(()=>demoRows[0].querySelector('.subjectParent').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));
await p.locator('.messageListItem .subjectParent').nth(1).click();
await p.evaluate(()=>{mailboxFixtureFailure='changed';mailboxFixtureDelay=250;listVM.deleteCommand();});
check('Grouped Trash hides every selected native row before its preparation returns',await p.evaluate(() =>
 document.querySelectorAll('.messageListItem.pw-row-pending').length===2
 &&[...document.querySelectorAll('.messageListItem.pw-row-pending')].every(row=>getComputedStyle(row).display==='none')));
await p.waitForFunction(()=>document.querySelector('.pw-mailbox-notice')?.dataset.state==='error');
check('A failed grouped Trash restores the native rows and their exact selection',await p.evaluate(() =>
 !document.querySelector('.messageListItem.pw-row-pending')&&demoMessages[0].checked()&&demoMessages[1].checked()));
await p.evaluate(()=>{mailboxFixtureFailure='';mailboxFixtureDelay=20;mailboxFixtureCalls.length=0;});
await p.evaluate(()=>listVM.deleteCommand());
await p.waitForFunction(()=>mailboxFixtureCalls.some(request=>request.operation==='action'));
check('The reversible grouped action receives exactly the selected messages',await p.evaluate(()=>{
 const prepared=mailboxFixtureCalls.find(request=>request.operation==='prepare');
 const action=mailboxFixtureCalls.find(request=>request.operation==='action');
 return prepared?.folder==='INBOX'&&prepared.uids==='[1,2]'&&prepared.uidValidity===77&&action?.action==='trash';
}));
// The static fixture has no authoritative MessageList response to replace moved rows.
await p.evaluate(()=>document.querySelectorAll('.pw-row-pending').forEach(row=>{
 row.classList.remove('pw-row-pending');row.removeAttribute('aria-hidden');row.inert=false;
}));
await p.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
check('Escape leaves selection mode',await p.evaluate(()=>demoMessages.every(m=>!m.checked())&&document.querySelector('.pw-selection-bar').hidden));
await p.setViewportSize({width:390,height:844});
await p.waitForFunction(()=>document.documentElement.classList.contains('rl-mobile'));
check('Mobile keeps selection gesture-only without per-row controls',await p.evaluate(()=>
 [...document.querySelectorAll('.messageCheckbox,.checkboxCheckAll,.pw-mobile-select')]
  .every(x=>getComputedStyle(x).display==='none'||!x.getClientRects().length)));
await p.locator('.messageListItem .subjectParent').nth(3).click();
check('Short mobile tap still opens the message',await p.evaluate(()=>fixtureRowOpens.at(-1)===4&&demoMessages.every(m=>!m.checked())));
await p.evaluate(async()=>{
 const row=demoRows[0],part=row.querySelector('.senderParent'),r=part.getBoundingClientRect(),x=r.x+10,y=r.y+10;
 part.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:71,clientX:x,clientY:y}));
 await new Promise(resolve=>setTimeout(resolve,640));
 part.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:71,clientX:x,clientY:y}));
 part.click();
});
check('Long touch enters selection and suppresses the following click',await p.evaluate(()=>demoMessages[0].checked()&&document.querySelector('#V-MailMessageList').classList.contains('pw-selection-mode')&&fixtureRowOpens.at(-1)===4));
await p.locator('.messageListItem .subjectParent').nth(1).click();
check('Later mobile taps add to selection',await p.evaluate(()=>demoMessages[0].checked()&&demoMessages[1].checked()&&fixtureRowOpens.at(-1)===4));
check('Mobile exit control meets the touch target size',await p.evaluate(()=>{const r=document.querySelector('.pw-selection-finish').getBoundingClientRect();return r.height>=44&&r.width>=44&&document.documentElement.scrollWidth<=innerWidth;}));
await p.locator('.pw-selection-finish').click();
await p.evaluate(async()=>{
 const row=demoRows[4],part=row.querySelector('.senderParent'),r=part.getBoundingClientRect(),x=r.x+10,y=r.y+10;
 part.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:73,clientX:x,clientY:y}));
 await new Promise(resolve=>setTimeout(resolve,1100));
 part.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:73,clientX:x,clientY:y}));
 part.click();
});
check('A long hold still suppresses its release click',await p.evaluate(()=>demoMessages[4].checked()&&fixtureRowOpens.at(-1)===4));
await p.locator('.pw-selection-finish').click();
await p.evaluate(async()=>{
 const row=demoRows[2],part=row.querySelector('.senderParent'),r=part.getBoundingClientRect(),x=r.x+10,y=r.y+10;
 part.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:72,clientX:x,clientY:y}));
 part.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:72,clientX:x,clientY:y+14}));
 await new Promise(resolve=>setTimeout(resolve,640));
});
check('Scrolling cancels the long-touch timer',await p.evaluate(()=>demoMessages.every(m=>!m.checked())&&document.querySelector('.pw-selection-bar').hidden));
await p.setViewportSize({width:1440,height:900});
await p.evaluate(()=>document.querySelector('#V-MailMessageList').removeAttribute('data-pw-selection-version'));
check('Missing selection script marker restores native desktop checkboxes',await p.evaluate(()=>getComputedStyle(demoRows[0].querySelector('.messageCheckbox')).display!=='none'&&getComputedStyle(document.querySelector('.checkboxCheckAll')).display!=='none'));
check('No runtime errors',await p.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:results.length,results},null,2));
