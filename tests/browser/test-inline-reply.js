const fixtureBase=globalThis.PW_FIXTURE_URL||'http://127.0.0.1:8876';
const p=await browser.getPage('nextsnapmail-inline-reply');p.setDefaultTimeout(8000);
await p.setViewportSize({width:1280,height:820});
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
 dialog.querySelector('#tab-body').checked=true;
 const editor=document.createElement('div');editor.className='squire-wysiwyg';editor.contentEditable='true';editor.textContent='Bonjour Camille';
 dialog.querySelector('.textAreaParent').replaceChildren(editor);
 const originalParent=document.getElementById('rl-app');originalParent.append(dialog);
 const vm={viewModelTemplateID:'PopupsCompose',viewModelDom:dialog,modalVisible:ko.observable(false),aDraftInfo:null,
  onShow(type,message){this.initOnShow({mode:type,message});},
  initOnShow(options){this.aDraftInfo=options.mode===1||options.mode===2?['reply',options.message.uid,options.message.folder]:['forward',options.message.uid,options.message.folder];},
  oEditor:{focus:()=>editor.focus(),getData:()=>editor.innerHTML}};
 vm.modalVisible.subscribe(value=>{if(value){dialog.showModal();requestAnimationFrame(()=>dialog.classList.add('animate'));}else{dialog.classList.remove('animate');setTimeout(()=>dialog.open&&dialog.close(),210);}});
 window.inlineCompose=vm;window.inlineEditor=editor;window.inlineOriginalParent=originalParent;
 dispatchEvent(new CustomEvent('rl-view-model.create',{detail:vm}));
 dispatchEvent(new CustomEvent('rl-view-model',{detail:vm}));
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
  &&getComputedStyle(rows[1]).display!=='none'&&inlineEditor.textContent==='Bonjour Camille';
}));
check('Expand is an explicit, named control and native reader compose actions are inert meanwhile',await p.evaluate(()=>{
 const button=document.querySelector('.pw-inline-expand');
 const reply=document.querySelector('[data-bind*="replyCommand"]');
 return button&&button.getAttribute('aria-label')==='Agrandir'&&button.querySelector('svg[aria-hidden="true"]')
  &&getComputedStyle(button).display==='inline-flex'&&reply?.inert===true;
}));
await p.evaluate(()=>{
 inlineEditor.focus();const range=document.createRange();range.setStart(inlineEditor.firstChild,7);range.collapse(true);
 const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
});
await p.locator('.pw-inline-expand').click();
await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').open);
await p.waitForFunction(()=>document.activeElement===inlineEditor&&getSelection().rangeCount
 &&getSelection().getRangeAt(0).startContainer===inlineEditor.firstChild
 &&getSelection().getRangeAt(0).startOffset===7);
check('Expand promotes the same DOM and content to the native modal',await p.evaluate(()=>{
 const dialog=document.getElementById('V-PopupsCompose');
 return dialog.open&&!dialog.classList.contains('pw-inline-reply')&&dialog.parentElement===inlineOriginalParent
  &&inlineEditor.textContent==='Bonjour Camille'&&!document.querySelector('.pw-inline-reply-slot');
}));
check('Expand preserves the editor focus and caret',await p.evaluate(()=>{
 const selection=getSelection();return document.activeElement===inlineEditor&&selection.rangeCount
  &&selection.getRangeAt(0).startContainer===inlineEditor.firstChild&&selection.getRangeAt(0).startOffset===7;
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
await p.setViewportSize({width:390,height:844});
await p.evaluate(()=>openCompose(1));await p.waitForSelector('#V-PopupsCompose.pw-inline-reply');
check('The inline composer fits the narrow reader without a horizontal overflow',await p.evaluate(()=>{
 const slot=document.querySelector('.pw-inline-reply-slot').getBoundingClientRect();
 const dialog=document.getElementById('V-PopupsCompose').getBoundingClientRect();
 return slot.left>=0&&slot.right<=innerWidth&&dialog.left>=slot.left&&dialog.right<=Math.ceil(slot.right)
  &&document.documentElement.scrollWidth<=innerWidth;
}));
await p.evaluate(()=>document.querySelector('.b-message').classList.remove('pw-conversation-active'));
await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').matches(':modal'));
check('Leaving the active conversation promotes the live draft to its popup',await p.evaluate(()=>{
 const dialog=document.getElementById('V-PopupsCompose');return dialog.matches(':modal')&&!dialog.classList.contains('pw-inline-reply')
  &&inlineEditor.textContent==='Bonjour Camille';
}));
await p.evaluate(()=>{inlineCompose.modalVisible(false);document.querySelector('.b-message').classList.add('pw-conversation-active');});
await p.waitForTimeout(250);await p.evaluate(()=>openCompose(1));await p.waitForSelector('#V-PopupsCompose.pw-inline-reply');
await p.evaluate(()=>document.documentElement.classList.remove('pw-theme'));
await p.waitForFunction(()=>document.getElementById('V-PopupsCompose').open);
check('Leaving the theme restores the still-edited native popup instead of hiding the draft',await p.evaluate(()=>{
 const dialog=document.getElementById('V-PopupsCompose');return dialog.open&&!dialog.classList.contains('pw-inline-reply')&&inlineEditor.textContent==='Bonjour Camille';
}));
console.log(JSON.stringify({passed:checks.length,checks}));
