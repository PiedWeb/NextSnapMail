const base='http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader&replyFixture=1';
const p=await browser.getPage('pied-web-compose-links');p.setDefaultTimeout(7000);
await p.setViewportSize({width:1280,height:820});
const checks=[];const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const ready=()=>p.evaluate(()=>{document.querySelector('#V-PopupsCompose')?.close();readerVM.messageLoadingThrottle(false);readerVM.canBeRepliedOrForwarded(true);});
await p.goto(base);await p.waitForSelector('.pw-reading-actions');await ready();
check('Bottom replies and Forward are account-scoped native message links',await p.evaluate(()=>
 [...document.querySelectorAll('.pw-reading-actions .btn')].every(node=>{
  const url=new URL(node.href),mode=node.classList.contains('pw-reading-forward')?'forward':node.classList.contains('pw-reading-reply-all')?'reply-all':'reply';
  return node.tagName==='A'&&url.searchParams.get('account')===rl.settings.get('accountHash')&&url.hash==='#/mailbox/INBOX/m101/pw-'+mode;
 })));
check('The native More menu uses the same reply/forward destinations',await p.evaluate(()=>
 ['reply','reply-all','forward'].every(mode=>{
  const node=document.querySelector('.dropdown-menu a[data-pw-compose-mode="'+mode+'"]');
  return node&&new URL(node.href).hash.endsWith('/pw-'+mode);
 })));
await p.locator('.pw-reading-forward').click();await p.locator('.pw-reading-forward').press('Space');await p.locator('.pw-reading-forward').press('Enter');
await p.evaluate(()=>document.querySelector('.dropdown-menu a[data-pw-compose-mode="forward"]').click());
check('Plain click and keyboard invoke native Forward once per activation',await p.evaluate(()=>actionCalls.filter(c=>c==='forward').length===4));
check('Modified clicks and context menus keep browser ownership on all added links',await p.evaluate(()=>{
 const count=actionCalls.length;let allowed=true;
 for(const node of document.querySelectorAll('.pw-reading-actions a,.buttonCompose,.pw-mobile-header a[data-pw-icon="compose"],.dropdown-menu a[data-pw-compose-mode]')){
  for(const event of [new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}),new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}),new MouseEvent('click',{bubbles:true,cancelable:true,metaKey:true}),new MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1})]){
   // Suppress the fixture's browser navigation without hiding any cancellation
   // by a plugin or native KO handler, including capture-phase interception.
   Event.prototype.preventDefault.call(event);let cancelled=false;
   event.preventDefault=()=>{cancelled=true;};node.dispatchEvent(event);allowed&&=!cancelled;
  }
 }
 return allowed&&actionCalls.length===count;
}));
await p.evaluate(()=>readerVM.forwardCommand.canExecute(false));
check('Disabled Forward removes destinations from the footer and menu',await p.evaluate(()=>
 [...document.querySelectorAll('[data-pw-compose-mode="forward"]')].every(node=>!node.hasAttribute('href')&&node.tabIndex===-1&&node.getAttribute('aria-disabled')==='true')));
await p.evaluate(()=>readerVM.forwardCommand.canExecute(true));
check('New message links carry only the account and a blank compose intent',await p.evaluate(()=>
 [...document.querySelectorAll('.buttonCompose,.pw-mobile-header a[data-pw-icon="compose"]')].length===3
 &&[...document.querySelectorAll('.buttonCompose,.pw-mobile-header a[data-pw-icon="compose"]')].every(node=>
  node.tagName==='A'&&new URL(node.href).hash==='#/mailbox/INBOX/pw-compose'&&new URL(node.href).searchParams.get('account')===rl.settings.get('accountHash'))));
await p.evaluate(()=>{
 document.querySelector('#V-MailFolderList .buttonCompose').click();
 document.querySelector('#V-MailMessageList .buttonCompose').click();
});
await p.setViewportSize({width:390,height:844});
await p.evaluate(()=>document.getElementById('rl-right').classList.remove('message-selected'));
await p.locator('.pw-mobile-header a[data-pw-icon="compose"]').press('Space');
await p.setViewportSize({width:1280,height:820});
check('Native and mobile New message controls invoke compose exactly once',await p.evaluate(()=>actionCalls.filter(c=>c==='compose').length===3));
await p.evaluate(()=>listVM.composeInEdit(true));
check('The native existing-draft button state remains bound',await p.evaluate(()=>
 [...document.querySelectorAll('.buttonCompose')].every(node=>node.classList.contains('btn-warning')&&!node.classList.contains('btn-success'))));
for(const mode of ['forward','compose']){
 const source=mode==='compose'?'INBOX':'Projets-fixture/m205';
 await p.goto(base+'&attempt='+mode+'#/mailbox/'+source+'/pw-'+mode);await p.waitForSelector('.pw-reading-actions');
 if(mode==='forward'){
  check('Forward waits for the source body rather than the initially selected mail',await p.evaluate(()=>!actionCalls.includes('forward')));
  await p.evaluate(()=>readerVM.message({...readerVM.message(),folder:'Projets/Équipe',uid:205}));await ready();
 }
 await p.waitForFunction(mode=>actionCalls.includes(mode==='compose'?'compose':'forward'),mode);
 check(mode+': only the requested native command runs once',await p.evaluate(mode=>
  actionCalls.filter(c=>['compose','forward','reply','replyAll'].includes(c)).join(',')===(mode==='compose'?'compose':'forward')
  &&!location.hash.includes('/pw-'),mode));
 await p.reload();await p.waitForSelector('.pw-reading-actions');await ready();
 check(mode+': reload does not open another composer',await p.evaluate(()=>!actionCalls.some(c=>['compose','forward','reply','replyAll'].includes(c))));
}
await p.goto(base+'&startupHashchange=1#/mailbox/INBOX/pw-compose');await p.waitForSelector('.pw-reading-actions');
check('Announcing the normalized startup route retains the one-shot compose intent',await p.evaluate(()=>actionCalls.filter(c=>c==='compose').length===1));
await p.goto(base+'&identitiesDelayed=1#/mailbox/INBOX/pw-compose');await p.waitForSelector('.pw-reading-actions');
check('Startup waits for the native AccountsAndIdentities response',await p.evaluate(()=>!actionCalls.includes('compose')));
await p.evaluate(()=>fixtureAccounts(fixtureAccountRows));await p.waitForFunction(()=>actionCalls.includes('compose'));
check('Completing AccountsAndIdentities opens the requested composer exactly once',await p.evaluate(()=>actionCalls.filter(c=>c==='compose').length===1));
await p.goto(base+'&attempt=disabled#/mailbox/INBOX/m101/pw-forward');await p.waitForSelector('.pw-reading-actions');
await p.evaluate(()=>readerVM.forwardCommand.canExecute(false));await ready();
check('A disabled startup Forward waits without using another command',await p.evaluate(()=>!actionCalls.includes('forward')));
await p.evaluate(()=>readerVM.forwardCommand.canExecute(true));await p.waitForFunction(()=>actionCalls.includes('forward'));
check('Enabling the exact Forward command consumes the intent once',await p.evaluate(()=>actionCalls.filter(c=>c==='forward').length===1));
await p.goto(base);await p.waitForSelector('.pw-reading-actions');await ready();
for(const dark of [false,true]){
 await p.setViewportSize({width:390,height:844});await p.evaluate(dark=>document.documentElement.dataset.themes=dark?'dark':'light',dark);
 check((dark?'Dark':'Light')+' mobile preserves footer targets and focuses the reader header',await p.evaluate(()=>
  [...document.querySelectorAll('.pw-reading-actions a')].filter(node=>getComputedStyle(node).display!=='none').every(node=>node.getBoundingClientRect().height>=44)
  &&getComputedStyle(document.querySelector('.pw-mobile-header a[data-pw-icon="compose"]')).display==='none'
  &&document.documentElement.scrollWidth<=innerWidth));
}
check('No fixture errors',await p.evaluate(()=>fixtureErrors.length===0));
await p.setViewportSize({width:1280,height:820});await p.goto('http://127.0.0.1:8876/.local-work/reply-links-host.html');
const frame=p.frames().find(frame=>frame.url().includes('images-native-preview'));await frame.waitForSelector('.pw-reading-actions');
await frame.evaluate(()=>readerVM.canBeRepliedOrForwarded(true));
for(const mode of ['forward','compose']){
 const destination=await frame.$eval(mode==='compose'?'.buttonCompose':'.pw-reading-forward',node=>node.href);
 const target=await browser.getPage('pied-web-compose-link-target');await target.goto(destination);
 const child=target.frames().find(frame=>frame.url().includes('images-native-preview'));await child.waitForSelector('.pw-reading-actions');
 await child.evaluate(()=>readerVM.canBeRepliedOrForwarded(true));await child.waitForFunction(mode=>actionCalls.includes(mode),mode);
 check(mode+': iframe targets retain the shell and consume the intent once',await target.evaluate(()=>!new URL(location.href).searchParams.get('target').includes('/pw-'))
  &&await child.evaluate(mode=>actionCalls.filter(c=>c===mode).length===1,mode));
 check(mode+': opening a destination leaves the source composer untouched',await frame.evaluate(()=>!actionCalls.some(c=>['compose','forward','reply','replyAll'].includes(c))));
 await target.goto('about:blank');
}
console.log(JSON.stringify({passed:checks.length,checks}));
