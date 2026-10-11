const base='http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader&replyFixture=1';
const p=await browser.getPage('pied-web-reply-links');p.setDefaultTimeout(7000);
await p.setViewportSize({width:1280,height:820});
const checks=[];const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const ready=()=>p.evaluate(()=>{readerVM.messageLoadingThrottle(false);readerVM.canBeRepliedOrForwarded(true);});
await p.goto(base);await p.waitForSelector('.pw-message-actions');await p.evaluate(()=>document.querySelector('#V-PopupsCompose')?.close());await ready();
check('Both toolbar actions have native message links and an explicit opaque account',await p.evaluate(()=>
 [...document.querySelectorAll('.pw-message-actions a')].every(node=>{
  const url=new URL(node.href);return node.tagName==='A'&&url.searchParams.get('account')===rl.settings.get('accountHash')
   &&url.hash==='#/mailbox/INBOX/m101/pw-'+(node.classList.contains('pw-reply-all')?'reply-all':'reply')&&!!node.getAttribute('aria-label');
 })));
await p.locator('.pw-reply').click();await p.locator('.pw-reply-all').press('Enter');await p.locator('.pw-reply').press('Space');
check('Plain click, Enter and Space preserve native reply commands in this tab',await p.evaluate(()=>
 actionCalls.filter(call=>call==='reply').length===2&&actionCalls.filter(call=>call==='replyAll').length===1));
check('Browser context menu and modified clicks are not cancelled or dispatched locally',await p.evaluate(()=>{
 const node=document.querySelector('.pw-reply'),count=actionCalls.length;
 const events=[new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}),
  ...['ctrlKey','metaKey','shiftKey','altKey'].map(key=>new MouseEvent('click',{bubbles:true,cancelable:true,[key]:true})),
  new MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1})];
 let allowed=true;
 for(const event of events){node.addEventListener(event.type,event=>{allowed&&=!event.defaultPrevented;event.preventDefault();},{once:true});node.dispatchEvent(event);}
 return allowed&&actionCalls.length===count;
}));
await p.evaluate(()=>readerVM.replyCommand.canExecute(false));
check('A disabled reply removes its destination and prevents mouse/keyboard dispatch',await p.evaluate(()=>{
 const node=document.querySelector('.pw-reply'),count=actionCalls.length;
 node.click();node.dispatchEvent(new MouseEvent('auxclick',{cancelable:true,button:1}));
 return !node.hasAttribute('href')&&node.getAttribute('aria-disabled')==='true'&&node.tabIndex===-1&&actionCalls.length===count;
}));
await p.evaluate(()=>{
 readerVM.replyCommand.canExecute(true);
 readerVM.message({...readerVM.message(),folder:'Projets/Équipe',uid:205});
});
check('Changing messages uses the native nested-folder hash and current UID',await p.evaluate(()=>
 new URL(document.querySelector('.pw-reply-all').href).hash==='#/mailbox/Projets-fixture/m205/pw-reply-all'));
for(const mode of ['reply','reply-all']) {
 await p.goto(base+'&attempt='+mode+'#/mailbox/INBOX/m101/pw-'+mode);await p.waitForSelector('.pw-message-actions');
 check(mode+': loading strips the one-shot intent without opening a partial message',await p.evaluate(()=>
  location.hash==='#/mailbox/INBOX/m101'&&!actionCalls.includes('reply')&&!actionCalls.includes('replyAll')));
 await p.evaluate(()=>{
  const command=readerVM.replyCommand,all=readerVM.replyAllCommand;
  readerVM.replyCommand=Object.assign(()=>{window.fixturePopup=!!PiedWebUx.replyLinks.opening;command();},{canExecute:command.canExecute});
  readerVM.replyAllCommand=Object.assign(()=>{window.fixturePopup=!!PiedWebUx.replyLinks.opening;all();},{canExecute:all.canExecute});
 });
 await ready();await p.waitForFunction(()=>actionCalls.includes('reply')||actionCalls.includes('replyAll'));
 check(mode+': only the requested native command runs, with full-composer intent',await p.evaluate(()=>{
  const expected=location.hash.endsWith('/m101')&&window.fixturePopup;
  return expected&&actionCalls.filter(call=>call==='reply'||call==='replyAll').length===1;
 }));
 check(mode+': the selected reply mode is correct',await p.evaluate(()=>actionCalls.includes('replyAll'))===(mode==='reply-all'));
 await p.reload();await p.waitForSelector('.pw-message-actions');await p.evaluate(()=>document.querySelector('#V-PopupsCompose')?.close());await ready();
 check(mode+': reload does not create another reply',await p.evaluate(()=>!actionCalls.includes('reply')&&!actionCalls.includes('replyAll')));
}
await p.goto(base+'&attempt=missing#/mailbox/INBOX/m999/pw-reply');await p.waitForSelector('.pw-message-actions');await p.evaluate(()=>document.querySelector('#V-PopupsCompose')?.close());await ready();
check('An absent source never replies to an unrelated message',await p.evaluate(()=>!actionCalls.includes('reply')));
await p.goto(base+'&attempt=wrong-folder#/mailbox/Sent/m101/pw-reply');await p.waitForSelector('.pw-message-actions');await p.evaluate(()=>document.querySelector('#V-PopupsCompose')?.close());await ready();
check('A matching UID in a different folder never starts a reply',await p.evaluate(()=>!actionCalls.includes('reply')));
await p.goto(base+'&attempt=body#/mailbox/INBOX/m101/pw-reply');await p.waitForSelector('.pw-message-actions');
await p.evaluate(()=>readerVM.message({...readerVM.message(),body:null}));await ready();
check('Matching metadata without a loaded body does not compose a partial reply',await p.evaluate(()=>!actionCalls.includes('reply')));
await p.evaluate(()=>readerVM.message({...readerVM.message(),body:document.querySelector('.bodyText')}));
await p.waitForFunction(()=>actionCalls.includes('reply'));
check('The matching body completes the pending reply exactly once',await p.evaluate(()=>actionCalls.filter(c=>c==='reply').length===1));
await p.goto(base+'&attempt=account#/mailbox/INBOX/m101/pw-reply');await p.waitForSelector('.pw-message-actions');
await p.evaluate(()=>{const original=rl.settings.get;rl.settings.get=key=>key==='accountHash'?'b'.repeat(40):original(key);});await ready();
check('A changed account never consumes another account\'s reply intent',await p.evaluate(()=>!actionCalls.includes('reply')));
await p.goto(base+'&attempt=navigation#/mailbox/INBOX/m101/pw-reply');await p.waitForSelector('.pw-message-actions');
await p.evaluate(()=>{location.hash='#/mailbox/Sent';});await ready();
check('Navigation cancels an outstanding reply intent',await p.evaluate(()=>!actionCalls.includes('reply')));
await p.goto(base);await p.waitForSelector('.pw-message-actions');await p.evaluate(()=>document.querySelector('#V-PopupsCompose')?.close());await ready();
for(const dark of [false,true]){
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(dark=>document.documentElement.dataset.themes=dark?'dark':'light',dark);
 check((dark?'Dark':'Light')+' mobile retains named links and native compact geometry',await p.evaluate(()=>
  [...document.querySelectorAll('.pw-message-actions a')].every(node=>node.getBoundingClientRect().height>=32&&!!node.getAttribute('aria-label'))
  &&document.documentElement.scrollWidth<=innerWidth));
}
check('No fixture errors',await p.evaluate(()=>fixtureErrors.length===0));
await p.setViewportSize({width:1280,height:820});
await p.goto('http://127.0.0.1:8876/.local-work/reply-links-host.html');
const frame=p.frames().find(frame=>frame.url().includes('images-native-preview'));
await frame.waitForSelector('.pw-message-actions');
await frame.evaluate(()=>{document.querySelector('#V-PopupsCompose')?.close();readerVM.canBeRepliedOrForwarded(true);});
check('Iframe links retain the Nextcloud shell and its native target contract',await frame.evaluate(()=>{
 const url=new URL(document.querySelector('.pw-reply-all').href);
 return url.pathname.endsWith('reply-links-host.html')&&url.searchParams.get('target')==='/mailbox/INBOX/m101/pw-reply-all';
}));
for(const mode of ['reply','reply-all']){
 const destination=await frame.$eval(mode==='reply'?'.pw-reply':'.pw-reply-all',node=>node.href);
 const popup=await browser.getPage('pied-web-reply-link-target');
 await popup.goto(destination);
 await popup.waitForSelector('iframe');
 const child=popup.frames().find(frame=>frame.url().includes('images-native-preview'));
 await child.waitForSelector('.pw-message-actions');
 check('Opening the '+mode+' destination in another tab leaves the source commands untouched',
  await frame.evaluate(()=>!actionCalls.includes('replyAll')&&!actionCalls.includes('reply')));
 check(mode+': both parent target and child hash consume the intent before reload',await popup.evaluate(()=>
  new URL(location.href).searchParams.get('target')==='/mailbox/INBOX/m101')&&await child.evaluate(()=>location.hash==='#/mailbox/INBOX/m101'));
 await child.evaluate(()=>readerVM.canBeRepliedOrForwarded(true));
 await child.waitForFunction(()=>actionCalls.includes('replyAll')||actionCalls.includes('reply'));
 check(mode+': the new iframe tab invokes the requested command exactly once',await child.evaluate(()=>actionCalls.filter(c=>c==='replyAll'||c==='reply').length===1)
  &&await child.evaluate(()=>actionCalls.includes('replyAll'))===(mode==='reply-all'));
 await popup.goto('about:blank');
}
console.log(JSON.stringify({passed:checks.length,checks}));
