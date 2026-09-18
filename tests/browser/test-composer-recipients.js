const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-composer-recipients');
p.setDefaultTimeout(8000);
await p.setViewportSize({width:1440,height:950});
await p.emulateMedia({colorScheme:'light'});
await p.goto(base+'?mode=list&side=1&shell=1');
await p.evaluate(async()=>{
 document.getElementById('V-PopupsCompose')?.remove();
 const html=await (await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsCompose.html')).text();
 const dialog=document.createElement('dialog');dialog.id='V-PopupsCompose';dialog.innerHTML=html;
 dialog.querySelectorAll('[data-bind]').forEach(node=>node.removeAttribute('data-bind'));
 dialog.querySelectorAll('[data-i18n]').forEach(node=>{
  const key=node.dataset.i18n;if(!key.startsWith('['))node.textContent=rl.i18n(key);
 });
 dialog.querySelectorAll('.b-header tr').forEach(row=>{
  const key=row.querySelector('label[data-i18n]')?.dataset.i18n;
  if(!['GLOBAL/TO','GLOBAL/CC','GLOBAL/BCC','GLOBAL/REPLY_TO'].includes(key))return;
  const input=row.querySelector('input[type="text"]');if(!input)return;
  const box=document.createElement('ul');box.className='emailaddresses';
  const item=document.createElement('li');item.className='emailaddresses-input';
  input.replaceWith(box);item.append(input);box.append(item);
 });
 const vm={viewModelTemplateID:'PopupsCompose',viewModelDom:dialog,
  showCc:ko.observable(false),showBcc:ko.observable(false)};
 for(const [selector,observable] of [['.cc-row',vm.showCc],['.bcc-row',vm.showBcc]]){
  const row=dialog.querySelector(selector);const update=()=>row.hidden=!observable();observable.subscribe(update);update();
 }
 document.querySelector('#rl-app').append(dialog);dialog.showModal();
 dialog.style.top='0';dialog.style.bottom='auto';dialog.style.height='auto';dialog.style.maxHeight='900px';dialog.style.opacity='1';
 dispatchEvent(new CustomEvent('rl-view-model',{detail:vm}));
 window.recipientCompose=vm;
});
await p.waitForSelector('.pw-recipient-shortcuts');

check('From, To and Subject have the same single-line width and height',await p.evaluate(()=>{
 const rows=[...document.querySelectorAll('#V-PopupsCompose .b-header tr')];
 const from=rows.find(row=>row.querySelector('[data-i18n="GLOBAL/FROM"]'))?.querySelector(':scope > td:last-child > input');
 const to=document.querySelector('.pw-recipient-shortcuts').parentElement.querySelector('.emailaddresses');
 const subject=rows.find(row=>row.querySelector('[data-i18n="GLOBAL/SUBJECT"]'))?.querySelector('input');
 const boxes=[from,to,subject].map(node=>node.getBoundingClientRect());
 return boxes.every(box=>Math.abs(box.width-boxes[0].width)<.5&&Math.abs(box.height-boxes[0].height)<.5)
  &&boxes.every(box=>Math.abs(box.right-boxes[0].right)<.5)&&Math.abs(boxes[0].height-36)<.5;
}));
check('A single recipient stays one line while wrapped recipients can grow',await p.evaluate(()=>{
 const box=document.querySelector('.pw-recipient-shortcuts').parentElement.querySelector('.emailaddresses');
 const input=box.querySelector('.emailaddresses-input');const added=[];
 const add=label=>{const li=document.createElement('li');li.draggable=true;li.textContent=label;box.insertBefore(li,input);added.push(li);};
 const empty=box.getBoundingClientRect().height;add('Destinataire test');
 const single=box.getBoundingClientRect().height;
 for(let index=0;index<20;index++)add('Destinataire '+(index+2));
 const wrapped=box.getBoundingClientRect().height;added.forEach(node=>node.remove());
 return empty===36&&single===empty&&wrapped>single&&wrapped<=72;
}));

check('Cc and Cci sit together below the To input, aligned to the recipient column end',await p.evaluate(()=>{
 const group=document.querySelector('.pw-recipient-shortcuts');
 const input=group.parentElement.querySelector('input');
 const a=group.getBoundingClientRect(),b=input.getBoundingClientRect();
 return group.closest('tr').querySelector('[data-i18n="GLOBAL/TO"]')
  &&a.top>=b.bottom&&getComputedStyle(group).justifyContent==='flex-end'
  &&[...group.children].map(node=>node.textContent.trim()).join('|')==='Cc|Cci';
}));
check('The distant native header duplicates are hidden while Pied Web is active',await p.evaluate(()=>
 [...document.querySelectorAll('#V-PopupsCompose > header > .pull-right > a[data-i18n="GLOBAL/CC"],#V-PopupsCompose > header > .pull-right > a[data-i18n="GLOBAL/BCC"]')]
  .every(node=>getComputedStyle(node).display==='none')));
check('Recipient shortcuts are quiet grey text with no resting underline',await p.evaluate(()=>{
 const button=document.querySelector('.pw-recipient-shortcut');const style=getComputedStyle(button);
 const input=getComputedStyle(document.querySelector('.pw-recipient-shortcuts').parentElement.querySelector('input'));
 return style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.borderBottomColor==='rgba(0, 0, 0, 0)'
  &&style.color!==input.color&&parseFloat(style.fontSize)<=12;
}));
await p.locator('.pw-recipient-shortcut[data-field="cc"]').hover();
check('Hover adds the requested discreet underline',await p.evaluate(()=>{
 const style=getComputedStyle(document.querySelector('.pw-recipient-shortcut[data-field="cc"]'));
 return style.borderBottomStyle==='solid'&&parseFloat(style.borderBottomWidth)===1
  &&style.borderBottomColor!=='rgba(0, 0, 0, 0)';
}));

await p.locator('.pw-recipient-shortcut[data-field="cc"]').click();
await p.waitForFunction(()=>document.activeElement===document.querySelector('.cc-row input'));
check('Opening Cc reveals and focuses its native input, then hides only Cc',await p.evaluate(()=>{
 const cc=document.querySelector('.pw-recipient-shortcut[data-field="cc"]');
 const bcc=document.querySelector('.pw-recipient-shortcut[data-field="bcc"]');
 return recipientCompose.showCc()&&!document.querySelector('.cc-row').hidden&&cc.hidden&&!bcc.hidden;
}));
await p.locator('.pw-recipient-shortcut[data-field="bcc"]').click();
await p.waitForFunction(()=>document.activeElement===document.querySelector('.bcc-row input'));
check('Opening Cci hides the last shortcut without changing the native fields',await p.evaluate(()=>
 recipientCompose.showBcc()&&!document.querySelector('.bcc-row').hidden
 &&document.querySelector('.pw-recipient-shortcuts').hidden));
await p.evaluate(()=>recipientCompose.showCc(false));
check('Closing one optional field makes its nearby shortcut available again',await p.evaluate(()=>{
 const group=document.querySelector('.pw-recipient-shortcuts');
 return !group.hidden&&!group.querySelector('[data-field="cc"]').hidden
  &&group.querySelector('[data-field="bcc"]').hidden;
}));
await p.locator('.pw-recipient-shortcuts').locator('xpath=preceding-sibling::*[1]//input').focus();
await p.locator('.pw-recipient-shortcuts').locator('xpath=preceding-sibling::*[1]//input').press('Tab');
check('Keyboard focus remains plainly visible',await p.evaluate(()=>{
 const style=getComputedStyle(document.activeElement);
 return document.activeElement.matches('.pw-recipient-shortcut:focus-visible')
  &&style.outlineStyle==='solid'&&parseFloat(style.outlineWidth)>=2;
}));

await p.setViewportSize({width:390,height:844});
check('The shortcuts remain inside the composer on a narrow screen',await p.evaluate(()=>{
 const box=document.querySelector('.pw-recipient-shortcuts').getBoundingClientRect();
 return box.left>=0&&box.right<=innerWidth+1;
}));
await p.setViewportSize({width:1440,height:950});
await p.evaluate(()=>document.documentElement.classList.remove('pw-theme'));
check('Leaving the theme restores the native header links and hides the enhancement',await p.evaluate(()=>{
 const native=[...document.querySelectorAll('#V-PopupsCompose > header > .pull-right > a[data-i18n="GLOBAL/CC"],#V-PopupsCompose > header > .pull-right > a[data-i18n="GLOBAL/BCC"]')];
 return getComputedStyle(document.querySelector('.pw-recipient-shortcuts')).display==='none'
  &&native.every(node=>getComputedStyle(node).display!=='none');
}));
console.log(JSON.stringify({passed:checks.length,checks}));
