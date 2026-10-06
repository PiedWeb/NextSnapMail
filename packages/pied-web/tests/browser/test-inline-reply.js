const fixtureBase=globalThis.PW_FIXTURE_URL||'http://127.0.0.1:8876';
const p=await browser.getPage('nextsnapmail-inline-reply');p.setDefaultTimeout(8000);
await p.setViewportSize({width:1920,height:1080});
await p.goto(fixtureBase+'/.local-work/images-native-preview.html?drafts=1&mode=reader&side=1');
await p.waitForFunction(()=>window.draftsReady);
await p.addScriptTag({url:fixtureBase+'/.local-work/pied-web-ux/inline-reply.js'});
await p.evaluate(async()=>{
 document.documentElement.classList.add('pw-theme');
 const current={folder:'INBOX',uid:42};readerVM.message(current);
 document.querySelector('#V-MailMessageView .b-message').classList.add('pw-conversation-active');
 dispatchEvent(new CustomEvent('rl-view-model',{detail:readerVM}));
 const markup=await (await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsCompose.html')).text();
 const dialog=document.createElement('dialog');dialog.id='V-PopupsCompose';dialog.innerHTML=markup;
 dialog.querySelectorAll('[data-bind]').forEach(node=>node.removeAttribute('data-bind'));
 dialog.querySelectorAll('[data-i18n]').forEach(node=>{
  const key=node.dataset.i18n;
  if(key.startsWith('[title]'))node.title=rl.i18n(key.slice(7));
  else node.textContent=rl.i18n(key);
 });
 dialog.querySelector('header > a:first-child i').className='icon-paper-plane';
 dialog.querySelector('#tab-body').checked=true;
 dialog.querySelectorAll('.bcc-row,.reply-to-row,label[for="tab-mailvelope"],#mailvelope-editor,.b-header .dropdown,.e-identity').forEach(node=>node.style.display='none');
 dialog.querySelectorAll('.b-header input').forEach(input=>input.value='Camille Exemple');
 // Exercise the actual recipient chips and complete toolbar, not a bare editable div.
 for(const selector of ['.cc-row','tr:has([data-i18n="GLOBAL/TO"])']) {
  const input=dialog.querySelector(selector+' input');
  const box=document.createElement('ul');box.className='emailaddresses';input.replaceWith(box);
  for(const name of ['Camille Exemple','Dominique Exemple']) {
   const chip=document.createElement('li');chip.draggable=true;chip.textContent=name;box.append(chip);
  }
  const item=document.createElement('li');item.className='emailaddresses-input';item.append(input);box.append(item);
 }
 const originalParent=document.getElementById('rl-app');originalParent.append(dialog);
 const vm={viewModelTemplateID:'PopupsCompose',viewModelDom:dialog,modalVisible:ko.observable(false),aDraftInfo:null,
  onShow(type,message){this.initOnShow({mode:type,message});},
  initOnShow(options){this.aDraftInfo=options.mode===1||options.mode===2?['reply',options.message.uid,options.message.folder]:['forward',options.message.uid,options.message.folder];},
  oEditor:null};
 vm.modalVisible.subscribe(value=>{if(value){dialog.showModal();requestAnimationFrame(()=>dialog.classList.add('animate'));}else{dialog.classList.remove('animate');setTimeout(()=>dialog.open&&dialog.close(),210);}});
 window.inlineCompose=vm;window.inlineOriginalParent=originalParent;
 dispatchEvent(new CustomEvent('rl-view-model.create',{detail:vm}));
 dispatchEvent(new CustomEvent('rl-view-model',{detail:vm}));
 await new Promise(resolve=>{
  vm.oEditor=new NativeHtmlEditor(dialog.querySelector('.textAreaParent'),()=>{
   vm.oEditor.setHtml('<div>Bonjour Camille</div><div><br></div><div class="rl-signature">Signature de test</div>');
   window.inlineEditor=dialog.querySelector('.squire-wysiwyg');
   window.inlineText=inlineEditor.firstChild.firstChild;
   resolve();
  });
 });
 window.openCompose=type=>{vm.modalVisible(true);vm.onShow(type,current);};
 openCompose(1);
});
await p.waitForSelector('#V-PopupsCompose.pw-inline-reply');
const checks=[];const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
check('Reply docks the one native composer at the bottom of the active conversation',await p.evaluate(()=>{
 const dialog=document.getElementById('V-PopupsCompose'),slot=dialog.parentElement;
 return dialog.open&&inlineCompose.modalVisible()&&slot.classList.contains('pw-inline-reply-slot')
  &&document.querySelector('.b-message.pw-conversation-active').contains(slot)
  &&getComputedStyle(dialog).position==='static'&&getComputedStyle(dialog).display==='flex';
}));
check('The inline card keeps recipients and the native editor while collapsing fixed reply fields',await p.evaluate(()=>{
 const rows=[...document.querySelectorAll('#V-PopupsCompose .b-header tr')];
 return getComputedStyle(rows[0]).display==='none'&&getComputedStyle(rows.at(-1)).display==='none'
  &&getComputedStyle(rows[1]).display!=='none'&&inlineEditor.textContent.includes('Bonjour Camille');
}));
check('The complete inline editor has at least 320 px for writing below its toolbar',await p.evaluate(()=>{
 const editor=inlineEditor.getBoundingClientRect(),toolbar=document.querySelector('#V-PopupsCompose .squire-toolbar').getBoundingClientRect();
 return editor.height>=320&&editor.top>=toolbar.bottom-1;
}));
check('The reply uses the available reader width instead of the old 640 px card',await p.evaluate(()=>
 document.getElementById('V-PopupsCompose').getBoundingClientRect().width>=720));
await p.evaluate(()=>{
 const box=document.querySelector('#V-PopupsCompose .cc-row .emailaddresses');
 for(let index=0;index<12;index++) {
  const chip=document.createElement('li');chip.draggable=true;chip.textContent='Correspondant de démonstration '+index;box.prepend(chip);
 }
});
check('Wrapped Cc chips leave the writing area intact',await p.evaluate(()=>
 document.querySelector('#V-PopupsCompose .cc-row .emailaddresses').getBoundingClientRect().height===72
 &&inlineEditor.getBoundingClientRect().height>=320));
await p.locator('#V-PopupsCompose .pw-compose-more').click();
check('Showing every formatting tool keeps at least 320 px for the message',await p.evaluate(()=>
 inlineEditor.getBoundingClientRect().height>=320));
await p.locator('#V-PopupsCompose .pw-compose-more').click();
check('Expand is an explicit, named control and native reader compose actions are inert meanwhile',await p.evaluate(()=>{
 const button=document.querySelector('.pw-inline-expand');
 const reply=document.querySelector('[data-bind*="replyCommand"]');
 return button&&button.getAttribute('aria-label')==='Agrandir'&&button.querySelector('svg[aria-hidden="true"]')
  &&getComputedStyle(button).display==='inline-flex'&&reply?.inert===true;
}));
await p.evaluate(()=>{
 inlineEditor.focus();const range=document.createRange();range.setStart(inlineText,7);range.collapse(true);
 const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
});
await p.locator('.pw-inline-expand').click();
await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').open);
await p.waitForFunction(()=>document.activeElement===inlineEditor&&getSelection().rangeCount
 &&getSelection().getRangeAt(0).startContainer===inlineText
 &&getSelection().getRangeAt(0).startOffset===7);
check('Expand promotes the same DOM and content to the native modal',await p.evaluate(()=>{
 const dialog=document.getElementById('V-PopupsCompose');
 return dialog.open&&!dialog.classList.contains('pw-inline-reply')&&dialog.parentElement===inlineOriginalParent
  &&inlineEditor.textContent.includes('Bonjour Camille')&&!document.querySelector('.pw-inline-reply-slot');
}));
check('Expand preserves the editor focus and caret',await p.evaluate(()=>{
 const selection=getSelection();return document.activeElement===inlineEditor&&selection.rangeCount
  &&selection.getRangeAt(0).startContainer===inlineText&&selection.getRangeAt(0).startOffset===7;
}));
await p.evaluate(()=>inlineCompose.modalVisible(false));
await p.waitForTimeout(280);
await p.evaluate(()=>openCompose(2));
await p.waitForSelector('#V-PopupsCompose.pw-inline-reply');
check('Reply all follows the inline path too',await p.evaluate(()=>PiedWebUx.inlineReply.active()&&document.getElementById('V-PopupsCompose').open));
await p.evaluate(()=>inlineCompose.modalVisible(false));await p.waitForTimeout(280);
await p.evaluate(()=>openCompose(3));await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').open);
check('Forward remains a full native popup',await p.evaluate(()=>!PiedWebUx.inlineReply.active()&&!document.getElementById('V-PopupsCompose').classList.contains('pw-inline-reply')));
await p.evaluate(()=>inlineCompose.modalVisible(false));await p.waitForTimeout(280);
for(const viewport of [{width:1280,height:820},{width:1920,height:600},{width:390,height:844}]) {
 await p.setViewportSize(viewport);
 await p.evaluate(()=>openCompose(1));
 await p.waitForTimeout(250); // Wait past deferred docking, so a transient modal cannot pass.
 check('Reply opens the full native composer at '+viewport.width+' × '+viewport.height,await p.evaluate(()=>{
  const dialog=document.getElementById('V-PopupsCompose'),box=dialog.getBoundingClientRect();
  return dialog.matches(':modal')&&!PiedWebUx.inlineReply.active()
   &&box.width>=Math.min(innerWidth*.95,1590)&&box.left>=0&&box.right<=innerWidth+1;
 }));
 await p.evaluate(()=>inlineCompose.modalVisible(false));await p.waitForTimeout(280);
}
await p.emulateMedia({colorScheme:'dark'});
await p.setViewportSize({width:1280,height:820});
await p.evaluate(()=>openCompose(2));await p.waitForTimeout(250);
check('Reply all also uses the full composer in a narrow dark reader',await p.evaluate(()=>
 document.getElementById('V-PopupsCompose').matches(':modal')&&!PiedWebUx.inlineReply.active()));
await p.evaluate(()=>inlineCompose.modalVisible(false));await p.waitForTimeout(280);
await p.emulateMedia({colorScheme:'light'});
await p.setViewportSize({width:1920,height:1080});
await p.evaluate(()=>openCompose(1));await p.waitForSelector('#V-PopupsCompose.pw-inline-reply');
await p.setViewportSize({width:1280,height:820});
await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').matches(':modal'));
check('Shrinking the reader promotes the same edited draft to the full composer',await p.evaluate(()=>
 !PiedWebUx.inlineReply.active()&&inlineEditor.textContent.includes('Bonjour Camille')));
await p.evaluate(()=>inlineCompose.modalVisible(false));await p.waitForTimeout(280);
await p.setViewportSize({width:1920,height:1080});
await p.evaluate(()=>openCompose(1));await p.waitForSelector('#V-PopupsCompose.pw-inline-reply');
await p.evaluate(()=>document.querySelector('.b-message').classList.remove('pw-conversation-active'));
await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').matches(':modal'));
check('Leaving the active conversation promotes the live draft to its popup',await p.evaluate(()=>{
 const dialog=document.getElementById('V-PopupsCompose');return dialog.matches(':modal')&&!dialog.classList.contains('pw-inline-reply')
  &&inlineEditor.textContent.includes('Bonjour Camille');
}));
await p.evaluate(()=>{inlineCompose.modalVisible(false);document.querySelector('.b-message').classList.add('pw-conversation-active');});
await p.waitForTimeout(250);await p.evaluate(()=>openCompose(1));await p.waitForSelector('#V-PopupsCompose.pw-inline-reply');
await p.evaluate(()=>document.documentElement.classList.remove('pw-theme'));
await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').open);
check('Leaving the theme restores the still-edited native popup instead of hiding the draft',await p.evaluate(()=>{
 const dialog=document.getElementById('V-PopupsCompose');return dialog.open&&!dialog.classList.contains('pw-inline-reply')&&inlineEditor.textContent.includes('Bonjour Camille');
}));
console.log(JSON.stringify({passed:checks.length,checks}));
