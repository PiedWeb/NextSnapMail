const p=await browser.getPage('nextsnapmail-reminders');p.setDefaultTimeout(7000);
await p.setViewportSize({width:1440,height:900});await p.emulateMedia({colorScheme:'light'});
await p.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader');
await p.waitForSelector('#V-MailMessageView .pw-message-actions');
await p.evaluate(async()=>{
 document.querySelectorAll('dialog[open]').forEach(node=>{try{node.close();}catch{}node.hidden=true;});
 window.reminderCalls=[];window.reminderFailure='';window.reminderEntries=[];
 const previous=rl.pluginRemoteRequest;
 rl.pluginRemoteRequest=(callback,action,params,timeout)=>{
  if(action!=='PiedWebReminders')return previous(callback,action,params,timeout);
  reminderCalls.push({...params});
  let result;
  if(reminderFailure)result={error:reminderFailure};
  else if(params.operation==='list')result={folder:'INBOX.Reminders',entries:reminderEntries};
  else if(params.operation==='wake')result={folder:'INBOX',count:String(params.uids).split(',').length};
  else result={folder:'INBOX.Reminders',count:String(params.uids).split(',').length,remindAt:params.remindAt};
  setTimeout(()=>callback(0,{Result:result}),20);
 };
 const current=readerVM.message();
 readerVM.message({...current,uid:1,folder:'INBOX',threads:()=>[11,12]});
 const script=document.createElement('script');script.src='/.local-work/pied-web-ux/reminders.js?test=1';document.body.append(script);
 await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;});
 dispatchEvent(new CustomEvent('rl-view-model',{detail:listVM}));
 dispatchEvent(new CustomEvent('rl-view-model',{detail:readerVM}));
});
await p.waitForSelector('.pw-remind-message:not([hidden])');
const results=[];const check=(name,ok)=>{if(!ok)throw new Error(name);results.push(name);console.log('PASS '+name);};

check('Inbox reader exposes one accessible reminder action',await p.evaluate(()=>{
 const button=document.querySelector('.pw-remind-message');
 return document.querySelectorAll('.pw-remind-message').length===1&&button.getAttribute('aria-label')==='Me le rappeler'
  &&button.getAttribute('aria-haspopup')==='dialog'&&button.querySelector('svg');
}));
check('The reader reminder matches the native action group',await p.evaluate(()=>{
 const button=document.querySelector('.pw-remind-message'),peer=document.querySelector('.pw-mark-unread');
 const style=getComputedStyle(button),peerStyle=getComputedStyle(peer),box=button.getBoundingClientRect(),peerBox=peer.getBoundingClientRect();
 const icon=getComputedStyle(button,'::before'),peerIcon=getComputedStyle(peer,'::before');
 return style.display===peerStyle.display&&style.borderTopWidth==='0px'&&style.boxShadow==='none'
  &&style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.borderRadius===peerStyle.borderRadius
  &&Math.abs(box.width-peerBox.width)<.5&&Math.abs(box.height-peerBox.height)<.5
  &&button.dataset.pwIcon==='clock'&&icon.maskImage!=='none'
  &&Math.abs(parseFloat(icon.width)-parseFloat(peerIcon.width))<.5
  &&Math.abs(parseFloat(icon.height)-parseFloat(peerIcon.height))<.5;
}));
await p.evaluate(()=>document.querySelector('.pw-remind-message').click());await p.waitForSelector('.pw-reminder-panel');
await p.waitForFunction(()=>document.querySelector('.pw-reminder-panel')?.style.left);
check('The picker offers the useful shortcuts and a custom local date',await p.evaluate(()=>{
 const labels=[...document.querySelectorAll('.pw-reminder-when')].map(node=>node.textContent);
 const input=document.querySelector('.pw-reminder-custom input');
 return labels.includes('Demain matin')&&labels.includes('Dans une semaine')&&input.type==='datetime-local'
  &&input.step==='60'&&new Date(input.min).getTime()>Date.now()&&new Date(input.value).getTime()>Date.now();
}));
check('The picker is an anchored dialog with 44 px controls',await p.evaluate(()=>{
 const panel=document.querySelector('.pw-reminder-panel'),button=document.querySelector('.pw-remind-message');
 return panel.getAttribute('role')==='dialog'&&button.getAttribute('aria-expanded')==='true'
  &&[...panel.querySelectorAll('button,input')].every(node=>node.getBoundingClientRect().height>=44)
  &&panel.getBoundingClientRect().right<=innerWidth-11&&panel.getBoundingClientRect().left>=11;
}));
await p.keyboard.press('Tab');
const focusState=await p.evaluate(()=>{
 const node=document.activeElement,style=getComputedStyle(node);
 return {inside:document.querySelector('.pw-reminder-panel').contains(node),visible:node.matches(':focus-visible'),
  width:parseFloat(style.outlineWidth),style:style.outlineStyle,tag:node.outerHTML.slice(0,100)};
});
check('Keyboard focus is visibly located inside the picker',focusState.inside&&focusState.visible&&focusState.width>=2&&focusState.style==='solid');
await p.locator('.pw-reminder-option').first().press('Escape');
check('Escape closes the picker and returns focus to its action',await p.evaluate(()=>
 !document.querySelector('.pw-reminder-panel')&&document.activeElement===document.querySelector('.pw-remind-message')
 &&document.activeElement.getAttribute('aria-expanded')==='false'));

// An endpoint error remains next to the decision; a retry schedules the whole conversation.
await p.evaluate(()=>{window.reminderFailure='sender';document.querySelector('.pw-remind-message').click();});
await p.locator('.pw-reminder-option').first().click();await p.waitForFunction(()=>document.querySelector('.pw-reminder-note')?.textContent.includes('service de rappel'));
check('A stopped worker leaves the picker open with a specific explanation',await p.evaluate(() =>
 document.querySelector('.pw-reminder-panel')&&document.querySelector('.pw-reminder-note').textContent==='Le service de rappel n’est pas actif sur ce serveur.'));
await p.evaluate(()=>window.reminderFailure='');await p.locator('.pw-reminder-option').first().click();
await p.waitForFunction(()=>!document.querySelector('.pw-reminder-panel')&&document.querySelector('.pw-reminder-toast')?.textContent);
check('One future UTC instant schedules the root and thread messages',await p.evaluate(()=>{
 const call=reminderCalls.filter(item=>item.operation==='set').at(-1),date=new Date(call.remindAt);
 return call.uids==='1,11,12'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(call.remindAt)
  &&date.getTime()>Date.now()&&document.querySelector('.pw-reminder-toast').textContent.includes('3 messages reviendront');
}));

// The existing Ctrl/long-touch selection bar receives the same operation for bulk triage.
await p.evaluate(()=>{
 document.getElementById('V-MailMessageView').hidden=true;document.getElementById('V-MailMessageList').hidden=false;
 document.getElementById('rl-right').classList.remove('message-selected');
 demoMessages[0].threads=()=>[101,102];demoMessages[0].checked(true);demoMessages[1].checked(true);
});
await p.waitForSelector('.pw-selection-remind:not([hidden])');
check('The selected-message bar exposes the same reminder action',await p.evaluate(()=>{
 const button=document.querySelector('.pw-selection-remind');return button.getAttribute('aria-label')==='Me le rappeler'&&button.querySelector('svg');
}));
await p.locator('.pw-selection-remind').click();await p.locator('.pw-reminder-option').last().click();
await p.waitForFunction(()=>demoMessages.every(message=>!message.checked()));
check('Bulk reminders include conversation UIDs once and leave selection mode',await p.evaluate(()=>{
 const call=reminderCalls.filter(item=>item.operation==='set').at(-1);
 return call.uids==='1,101,102,2'&&document.querySelector('.pw-selection-bar').hidden&&actionCalls.includes('reload');
}));

// Switch the fixture to the IMAP Reminders folder and expose its due metadata.
await p.evaluate(()=>{
 const due=new Date(Date.now()+7*86400000);due.setSeconds(0,0);
 reminderEntries=[{uid:1,remindAt:due.toISOString(),state:'pending'},{uid:2,remindAt:'',state:'unscheduled'}];
 demoMessages.folder='INBOX.Reminders';demoMessages.forEach(message=>message.folder='INBOX.Reminders');
 messageList.valueHasMutated();
 const current=readerVM.message();readerVM.message({...current,uid:1,folder:'INBOX.Reminders',threads:()=>[11,12]});
});
await p.waitForSelector('.messageListItem .pw-reminder-badge');
check('The Reminders folder shows dates without replacing native subjects',await p.evaluate(()=>{
 const badges=[...document.querySelectorAll('.pw-reminder-badge')];
 return badges.length===2&&badges[0].textContent&&badges[1].textContent==='Sans date de rappel'
  &&document.querySelector('.pw-remind-message').getAttribute('aria-label')==='Modifier le rappel';
}));
await p.evaluate(()=>{
 document.getElementById('V-MailMessageList').hidden=true;document.getElementById('V-MailMessageView').hidden=false;
 document.getElementById('rl-right').classList.add('message-selected');
});
await p.waitForSelector('.pw-reminder-bar:not([hidden])');
check('The reader explains the pending reminder and offers an immediate return',await p.evaluate(()=>{
 const bar=document.querySelector('.pw-reminder-bar');
 return !bar.hidden&&bar.querySelector('.pw-reminder-text').textContent.startsWith('Rappel ')
  &&bar.querySelector('.pw-reminder-wake').textContent==='Remettre dans la boîte de réception';
}));
await p.locator('.pw-reminder-wake').click();await p.waitForFunction(()=>document.querySelector('.pw-reminder-bar').hidden);
check('Return now requests one wake and confirms the unread Inbox state',await p.evaluate(()=>{
 const call=reminderCalls.filter(item=>item.operation==='wake').at(-1);
 return call.uids==='1,11,12'&&document.querySelector('.pw-reminder-toast').textContent==='3 messages remis dans la boîte de réception en non-lus.';
}));

await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>document.documentElement.classList.contains('rl-mobile'));
await p.evaluate(()=>{
 document.getElementById('V-MailMessageView').hidden=true;document.getElementById('V-MailMessageList').hidden=false;
 document.getElementById('rl-right').classList.remove('message-selected');
 demoMessages[0].checked(true);demoMessages[1].checked(true);
});await p.waitForSelector('.pw-selection-remind:not([hidden])');
await p.locator('.pw-selection-remind').click();
check('Phone controls stay touchable and the picker does not overflow',await p.evaluate(()=>{
 const action=document.querySelector('.pw-selection-remind').getBoundingClientRect(),panel=document.querySelector('.pw-reminder-panel').getBoundingClientRect();
 return action.width>=44&&action.height>=44&&panel.left>=11&&panel.right<=innerWidth-11&&document.documentElement.scrollWidth<=innerWidth;
}));
await p.locator('.pw-reminder-cancel').click();
check('No runtime errors',await p.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:results.length,results},null,2));
