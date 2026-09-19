const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-composer-tabs');
p.setDefaultTimeout(8000);
await p.setViewportSize({width:1440,height:950});
await p.emulateMedia({colorScheme:'light'});
await p.goto(base+'?mode=list&side=1&shell=1');
await p.evaluate(async()=>{
 document.getElementById('V-PopupsCompose')?.remove();
 const html=await (await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsCompose.html')).text();
 const source=document.createElement('template');source.innerHTML=html;
 const native=source.content.querySelector('.tabs');
 native.querySelectorAll('[data-bind]').forEach(node=>node.removeAttribute('data-bind'));
 native.querySelectorAll('[data-i18n]').forEach(node=>{
  const key=node.dataset.i18n;if(!key.startsWith('['))node.textContent=rl.i18n(key);
 });
 native.querySelector('#tab-body').checked=true;
 native.querySelector('label[for="tab-mailvelope"]').style.display='none';
 native.querySelector('#mailvelope-editor').style.display='none';
 const dialog=document.createElement('dialog');dialog.id='V-PopupsCompose';dialog.append(native);
 document.querySelector('#rl-app').append(dialog);dialog.showModal();
 dialog.style.inset='0 auto auto 0';dialog.style.width='900px';dialog.style.height='500px';dialog.style.opacity='1';
 dispatchEvent(new CustomEvent('rl-view-model',{detail:{viewModelTemplateID:'PopupsCompose',viewModelDom:dialog}}));
});
await p.waitForSelector('.pw-compose-tabs.pw-mailvelope-hidden');

check('Hidden Mailvelope leaves two equal full-width tabs',await p.evaluate(()=>{
 const tabs=document.querySelector('.pw-compose-tabs');
 const labels=[...tabs.querySelectorAll(':scope > label[role="tab"]')].filter(node=>getComputedStyle(node).display!=='none');
 const panel=tabs.querySelector('.tab-content').getBoundingClientRect(),boxes=labels.map(node=>node.getBoundingClientRect());
 return labels.length===2&&Math.abs(boxes[0].width-boxes[1].width)<1
  &&Math.abs(boxes[0].width+boxes[1].width-panel.width)<1
  &&Math.abs(boxes[0].left-panel.left)<1&&Math.abs(boxes[1].right-panel.right)<1;
}));
check('Every tab panel spans the complete composer width',await p.evaluate(()=>{
 const labels=[...document.querySelectorAll('.pw-compose-tabs > label[role="tab"]')].filter(node=>getComputedStyle(node).display!=='none');
 const left=labels[0].getBoundingClientRect().left,right=labels.at(-1).getBoundingClientRect().right;
 return [...document.querySelectorAll('.pw-compose-tabs > .tab-content')]
  .filter(panel=>getComputedStyle(panel).display!=='none').every(panel=>{
  const box=panel.getBoundingClientRect();return Math.abs(box.left-left)<1&&Math.abs(box.right-right)<1;
 });
}));
check('The selected tab uses one accent line instead of a filled box',await p.evaluate(()=>{
 const label=document.querySelector('.pw-compose-tabs > input:checked + label'),style=getComputedStyle(label);
 return style.backgroundColor==='rgba(0, 0, 0, 0)'&&parseFloat(style.borderBottomWidth)===2
  &&style.borderBottomColor!=='rgba(0, 0, 0, 0)'&&label.getAttribute('aria-selected')==='true';
}));

await p.locator('label[for="tab-body"]').focus();
await p.locator('label[for="tab-body"]').press('ArrowRight');
check('Arrow keys select and focus the next visible tab',await p.evaluate(()=>
 document.querySelector('#tab-attachments').checked
 &&document.activeElement===document.querySelector('label[for="tab-attachments"]')
 &&document.activeElement.getAttribute('aria-selected')==='true'));

await p.evaluate(()=>{document.querySelector('label[for="tab-mailvelope"]').style.display='flex';});
await p.waitForFunction(()=>!document.querySelector('.pw-compose-tabs').classList.contains('pw-mailvelope-hidden'));
check('Available Mailvelope restores three equal tabs',await p.evaluate(()=>{
 const tabs=document.querySelector('.pw-compose-tabs');
 const labels=[...tabs.querySelectorAll(':scope > label[role="tab"]')],widths=labels.map(label=>label.getBoundingClientRect().width);
 return widths.every(width=>Math.abs(width-widths[0])<1)&&Math.abs(widths.reduce((a,b)=>a+b,0)-tabs.querySelector('.tab-content').getBoundingClientRect().width)<1;
}));

await p.setViewportSize({width:390,height:844});
await p.evaluate(()=>{
 const dialog=document.querySelector('#V-PopupsCompose');dialog.style.width='100vw';
 document.querySelector('label[for="tab-mailvelope"]').style.display='none';
});
await p.waitForFunction(()=>document.querySelector('.pw-compose-tabs').classList.contains('pw-mailvelope-hidden'));
await p.waitForFunction(()=>document.querySelector('#V-PopupsCompose').getBoundingClientRect().right<=innerWidth+1);
check('At 390 px labels stay on one 44 px line inside the composer',await p.evaluate(()=>{
 const labels=[...document.querySelectorAll('.pw-compose-tabs > label[role="tab"]')].filter(node=>getComputedStyle(node).display!=='none');
 return labels.every(label=>{
  const box=label.getBoundingClientRect(),style=getComputedStyle(label);
  return box.left>=0&&box.right<=innerWidth+1&&box.height===44&&style.whiteSpace==='nowrap';
 });
}));
console.log(JSON.stringify({passed:checks.length,checks}));
