// Fictional transport; real native templates and recipient component constructor.
const p=await browser.getPage('mail-refactoring-regressions');p.setDefaultTimeout(7000);
const base='http://127.0.0.1:8876/.local-work/';
const checks=[];const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
for(const width of [390,320]){
 await p.setViewportSize({width,height:900});
 await p.goto(base+'images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=2');
 await p.waitForFunction(()=>document.querySelectorAll('.pw-global-row').length===5&&!document.querySelector('.pw-global-refresh').disabled);
 check(width+': mobile identity names the global scope once without an active account',await p.evaluate(()=>{
  const title=document.querySelector('.pw-mobile-folder-label'),account=document.querySelector('.pw-account-label');
  return title.textContent==='Tous mes comptes'&&title.closest('#top-system-dropdown-id')&&getComputedStyle(account).display==='none';
 }));
 check(width+': account and folder targets are separate, at least 44px and inside the screen',await p.evaluate(()=>{
  const a=document.querySelector('#top-system-dropdown-id').getBoundingClientRect(),b=document.querySelector('.pw-mobile-header > .btn').getBoundingClientRect();
  return a.height>=44&&a.width>=44&&b.height>=44&&b.width>=44&&b.right<=a.left&&a.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;
 }));
 check(width+': global selection is progressive and subjects own a two-line full row',await p.evaluate(()=>{
  const row=document.querySelector('.pw-global-row'),subject=row.querySelector('.pw-global-subject');
  return getComputedStyle(document.querySelector('.pw-global-selection')).display==='none'&&getComputedStyle(subject).webkitLineClamp==='2'&&subject.getBoundingClientRect().width>=row.clientWidth-40;
 }));
 await p.locator('.pw-workspace-select a').evaluate(n=>n.click());
 check(width+': More can enter selection and Done exits without changing messages',await p.evaluate(()=>{
  const c=document.querySelector('.pw-global-selection');const active=c.classList.contains('pw-selection-active')&&document.activeElement===c.querySelector('input');
  [...c.querySelectorAll('button')].find(n=>n.textContent==='Terminer').click();return active&&!c.classList.contains('pw-selection-active');
 }));
 check(width+': full row labels include the complete source and explicit conversation state',await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('.pw-global-row')];return rows.every(n=>[...n.querySelectorAll('.pw-global-primary,.pw-global-subject,.pw-global-account')].every(e=>e.title===e.textContent)&&n.getAttribute('aria-label').includes(n.querySelector('.pw-global-account').textContent))&&document.querySelector('.pw-global-thread-unread').getAttribute('aria-label').includes('non lus dans la conversation');
 }));
}
await p.setViewportSize({width:1440,height:900});
await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.pw-global-row').length===5&&!document.querySelector('.pw-global-refresh').disabled);
check('Global refresh uses one visible control and actually reloads the global transport',await p.evaluate(async()=>{
 const buttons=[...document.querySelectorAll('[data-pw-icon=refresh]')].filter(n=>n.getBoundingClientRect().width&&getComputedStyle(n).display!=='none');
 const before=feedRequests.filter(r=>r.operation==='global').length;buttons[0].click();await new Promise(r=>setTimeout(r,80));
 return buttons.length===1&&feedRequests.filter(r=>r.operation==='global').length===before+1&&getComputedStyle(document.querySelector('.pw-global-status')).display==='none';
}));
await p.evaluate(()=>{window.feedGlobalItems.length=0;PiedWebUx.feed.refreshGlobal();});
await p.waitForFunction(()=>document.querySelector('.pw-global-feed').dataset.state==='empty');
check('Empty Feed explains its state and offers a working recovery action',await p.evaluate(()=>{
 const action=document.querySelector('.pw-global-recovery');return !action.hidden&&action.textContent==='Actualiser le flux'&&document.querySelector('.pw-global-status').textContent.includes('à jour');
}));
await p.locator('.inputSearch').fill('aucun-resultat');await p.locator('.inputSearch').press('Enter');
await p.waitForFunction(()=>document.querySelector('.pw-global-status').textContent.startsWith('0 résultat.'));
await p.locator('.pw-global-recovery').click();
check('An empty search can clear its query without changing account scope',await p.evaluate(()=>document.querySelector('.inputSearch').value===''));
await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.pw-global-row').length===5&&!document.querySelector('.pw-global-refresh').disabled);
await p.evaluate(()=>{
 window.originalMailboxRequest=mailboxFixtureRequest;
 window.mailboxFixtureRequest=(params,cb)=>{if(params.operation==='global'){setTimeout(()=>cb(1,null),20);return true;}return originalMailboxRequest(params,cb);};
 PiedWebUx.feed.refreshGlobal();
});
await p.waitForFunction(()=>document.querySelector('.pw-global-feed').dataset.state==='error');
check('Global load failure offers an enabled retry and ends its busy state',await p.evaluate(()=>!document.querySelector('.pw-global-recovery').hidden&&!document.querySelector('.pw-global-refresh').disabled&&document.querySelector('.pw-global-refresh').getAttribute('aria-busy')==='false'));
await p.evaluate(()=>window.mailboxFixtureRequest=originalMailboxRequest);await p.locator('.pw-global-recovery').click();
await p.waitForFunction(()=>document.querySelector('.pw-global-feed').dataset.state==='ready');
check('Retry recovers the original global transport',await p.evaluate(()=>document.querySelector('.pw-global-recovery').hidden));
await p.goto(base+'native-components-fixture.html');await p.evaluate(()=>fixtureReady);
for(const theme of ['light','dark']){
 await p.emulateMedia({colorScheme:theme});await p.evaluate(theme=>document.documentElement.dataset.themes=theme,theme);
 await p.setViewportSize({width:390,height:950});await p.evaluate(()=>fixtureRender('User/PopupsAdvancedSearch'));
 check(theme+': nested native select controls fill their available mobile column',await p.evaluate(()=>[...fixtureRoot.querySelectorAll('.control-group > div .e-component select,.control-group > .e-component select')].every(n=>n.getBoundingClientRect().width>=n.closest('.control-group').getBoundingClientRect().width-2)));
 check(theme+': resting field boundaries exceed 3:1 against their surface',await p.evaluate(()=>{
  const ctx=document.createElement('canvas').getContext('2d');
  const lum=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);};
  return [...fixtureRoot.querySelectorAll('input[type=text],select')].filter(n=>n.getClientRects().length).every(n=>{n.blur();n.getAnimations().forEach(a=>a.finish());const s=getComputedStyle(n),a=lum(s.borderTopColor),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3;});
 }));
}
await p.evaluate(()=>fixtureRender('User/SettingsGeneral'));
await p.evaluate(()=>{const node=document.createElement('span');node.className='settings-save-trigger error';fixtureRoot.append(node);});
await p.waitForFunction(()=>document.querySelector('.settings-save-trigger.error .pw-native-status-text')?.textContent.includes('réessayer'));
check('Save failure guidance is visible, wraps and remains announced politely',await p.evaluate(()=>{const n=document.querySelector('.settings-save-trigger.error'),s=getComputedStyle(n.querySelector('.pw-native-status-text'));return s.position==='static'&&s.clipPath==='none'&&s.whiteSpace==='normal'&&n.getAttribute('aria-live')==='polite';}));
await p.evaluate(()=>document.documentElement.style.fontSize='200%');
check('200% default font doubles the shared type scale without horizontal settings overflow',await p.evaluate(()=>{
 const s=getComputedStyle(fixtureRoot.querySelector('select'));return parseFloat(s.fontSize)>=28&&document.documentElement.scrollWidth<=innerWidth&&fixtureRoot.scrollWidth<=fixtureRoot.clientWidth+1;
}));
await p.evaluate(()=>document.documentElement.style.fontSize='');
// Mount the engine's actual recipient replacement. Transport, autocomplete and
// parsing are outside this name/geometry check; input values start empty.
await p.evaluate(async()=>{
 const app=await(await fetch('/app/snappymail/v/2.38.2/static/js/app.js')).text();
 const start=app.indexOf('class EmailAddressesComponent {'),end=app.indexOf('\n\t}\n',start)+4;
 const createElement=(name,attrs={})=>{const n=document.createElement(name);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));return n;};
 const addEventsListeners=(node,events)=>Object.entries(events).forEach(([k,v])=>node.addEventListener(k,v));
 const Component=new Function('doc','createElement','addEventsListeners','let datalist,dragAddress;return '+app.slice(start,end))(document,createElement,addEventsListeners);
 fixtureRoot.remove();const dialog=document.createElement('dialog');dialog.id='V-PopupsCompose';
 dialog.innerHTML=await(await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsCompose.html')).text();
 dialog.querySelectorAll('[data-bind]').forEach(n=>n.removeAttribute('data-bind'));
 dialog.querySelectorAll('[data-i18n]').forEach(n=>{if(!n.dataset.i18n.startsWith('['))n.textContent=n.dataset.i18n.split('/')[1];});
 dialog.querySelectorAll('.b-header tr').forEach(row=>{const input=row.querySelector('input[autocomplete=off]:not([name])');if(input)new Component(input,{focusCallback:()=>{},onChange:()=>{}});});
 document.getElementById('rl-popups').append(dialog);dialog.showModal();
 dispatchEvent(new CustomEvent('rl-view-model',{detail:{viewModelTemplateID:'PopupsCompose',viewModelDom:dialog}}));window.realComposer=dialog;
});
await p.waitForSelector('#V-PopupsCompose input[aria-labelledby],#V-PopupsCompose input[id]');
check('Actual recipient component replacement receives real label associations, including Cc, Bcc and Reply-To',await p.evaluate(()=>{
 const inputs=[...realComposer.querySelectorAll('.b-header input')];return inputs.length>=6&&inputs.every(n=>n.labels?.length||document.getElementById(n.getAttribute('aria-labelledby'))?.textContent);
}));
await p.evaluate(()=>realComposer.querySelector('[data-i18n="GLOBAL/TO"]').classList.add('error-to'));
await p.waitForSelector('.pw-recipient-error:not([hidden])');
check('Recipient errors are visible and described by the actual generated input',await p.evaluate(()=>{const input=realComposer.querySelector('[data-i18n="GLOBAL/TO"]').closest('tr').querySelector('input');return input.getAttribute('aria-invalid')==='true'&&document.getElementById(input.getAttribute('aria-describedby')).textContent.includes('destinataire valide');}));
await p.evaluate(()=>realComposer.querySelector('[data-i18n="GLOBAL/TO"]').classList.remove('error-to'));
await p.waitForFunction(()=>document.querySelector('.pw-recipient-error').hidden);
check('Correcting the recipient clears the invalid state without removing its field',await p.evaluate(()=>realComposer.querySelector('[data-i18n="GLOBAL/TO"]').closest('tr').querySelector('input').getAttribute('aria-invalid')==='false'));
await p.evaluate(()=>document.documentElement.style.fontSize='200%');
check('Native generated recipient fields respect 200% text and grow with it',await p.evaluate(()=>[...realComposer.querySelectorAll('.b-header input')].every(n=>parseFloat(getComputedStyle(n).fontSize)>=28&&n.getBoundingClientRect().height>=60)));
// Exercise the narrow toolbar's real mode adapter, not a replacement command.
await p.goto(base+'images-native-preview.html?mode=compose&shell=1');
await p.waitForSelector('.pw-compose-more');
check('Narrow composer keeps Source and Markdown in More',await p.evaluate(()=>document.querySelector('#squire-toolgroup-views').closest('.pw-compose-extra')?.hidden===true));
await p.locator('.pw-compose-more').click();await p.locator('[data-action=markdown]').click();
check('Markdown remains apparent while More is closed',await p.evaluate(()=>{const more=document.querySelector('.pw-compose-more');if(more.getAttribute('aria-expanded')==='true')more.click();return more.textContent.includes('Markdown')&&more.getAttribute('aria-label').includes('Markdown');}));
await p.setViewportSize({width:1440,height:950});
await p.waitForFunction(()=>document.querySelector('#squire-toolgroup-views').closest('.pw-compose-main'));
check('Wide composer restores the same native mode buttons to the main toolbar',await p.evaluate(()=>document.querySelectorAll('[data-action=markdown]').length===1));
for(const width of [1440,390,320]){
 await p.setViewportSize({width,height:950});
 await p.goto(base+'images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=2');
 await p.waitForFunction(()=>document.querySelectorAll('.pw-global-row').length===5&&!document.querySelector('.pw-global-refresh').disabled);
 await p.evaluate(()=>document.documentElement.style.fontSize='200%');
 await p.waitForFunction(()=>innerWidth>=800||document.querySelector('.pw-mobile-header').getBoundingClientRect().height>=100);
 check(width+': 200% list text stays within the viewport and mobile header grows',await p.evaluate(()=>{
  const subject=document.querySelector('.pw-global-subject'),header=document.querySelector('.pw-mobile-header');
  return parseFloat(getComputedStyle(subject).fontSize)>=28&&document.documentElement.scrollWidth<=innerWidth&&(innerWidth>=800||header.getBoundingClientRect().height>=100);
 }));
}
await p.goto(base+'images-native-preview.html?mode=reader&shell=1&listOnly=1');
await p.evaluate(()=>{const c=document.getElementById('V-PopupsCompose');if(c?.open)c.close();});
await p.waitForSelector('.buttonUp[role=button]');
check('Reader previous and next keep native handlers and have names and keyboard access',await p.evaluate(()=>[...document.querySelectorAll('.buttonUp,.buttonDown')].every(n=>n.tabIndex===0&&n.getAttribute('aria-label')&&n.getAttribute('role')==='button')));
check('Phone reader toolbar targets are at least 44px and do not overlap',await p.evaluate(()=>{
 const nodes=[...document.querySelectorAll('#V-MailMessageView > .top-toolbar .btn')].filter(n=>n.getBoundingClientRect().width&&getComputedStyle(n).display!=='none');
 const boxes=nodes.map(n=>n.getBoundingClientRect());
 return boxes.length>4&&boxes.every(a=>a.width>=44&&a.height>=44&&a.right<=innerWidth+1)&&boxes.every((a,i)=>boxes.every((b,j)=>i===j||a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5));
}));
check('System folders expose native button semantics and their current state',await p.evaluate(()=>[...document.querySelectorAll('.b-folders-system a:not([href])')].every(n=>n.getAttribute('role')==='button'&&n.tabIndex===0)&&!!document.querySelector('.b-folders-system .selected a[aria-current=page],.b-folders-system a.selected[aria-current=page]')));
console.log(JSON.stringify({passed:checks.length,checks}));
