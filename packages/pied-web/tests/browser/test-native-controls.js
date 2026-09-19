const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const masked=s=>s.maskImage!=='none'&&s.content==='""'&&s.backgroundColor!=='rgba(0, 0, 0, 0)';

const list=await browser.getPage('pied-web-native-controls-list');
list.setDefaultTimeout(8000);
await list.setViewportSize({width:1440,height:950});
await list.emulateMedia({colorScheme:'light'});
await list.goto(base+'?mode=list&side=1&shell=1&listOnly=1');
await list.waitForSelector('#top-system-dropdown-id');
check('The account switcher uses the theme chevron, not the text glyph',await list.evaluate(()=>{
 const s=getComputedStyle(document.querySelector('#top-system-dropdown-id'),'::after');
 return s.maskImage!=='none'&&s.content==='""'&&parseFloat(s.width)===14
  &&s.backgroundColor!=='rgba(0, 0, 0, 0)';
}));

const reader=await browser.getPage('pied-web-native-controls-reader');
reader.setDefaultTimeout(8000);
await reader.setViewportSize({width:1440,height:950});
await reader.emulateMedia({colorScheme:'light'});
await reader.goto(base+'?mode=reader&side=1&shell=1');
await reader.waitForSelector('#messageItem');
await reader.evaluate(()=>{
 const item=document.querySelector('#messageItem');
 let place=item.querySelector('.attachmentsPlace');
 if(!place){place=document.createElement('details');place.className='attachmentsPlace';
  place.innerHTML='<summary>Pièces jointes</summary><ul class="attachmentList"></ul>';
  item.append(place);}
 place.open=false;
});
await new Promise(r=>setTimeout(r,250));
const closed=await reader.evaluate(()=>{
 const s=getComputedStyle(document.querySelector('.attachmentsPlace > summary'),'::before');
 const own=getComputedStyle(document.querySelector('.attachmentsPlace > summary'));
 return {mask:s.maskImage,content:s.content,bg:s.backgroundColor,transform:s.transform,list:own.listStyleType};
});
check('The attachment section replaces the browser disclosure triangle',
 masked(closed)&&closed.list==='none');
check('Its chevron points sideways while the section is closed',
 closed.transform!=='none'&&closed.transform!=='matrix(1, 0, 0, 1, 0, 0)');
await reader.evaluate(()=>{document.querySelector('.attachmentsPlace').open=true;});
await reader.waitForFunction(()=>getComputedStyle(document.querySelector('.attachmentsPlace > summary'),'::before').transform==='matrix(1, 0, 0, 1, 0, 0)');
check('It turns down when the section opens',true);

const composer=await browser.getPage('pied-web-native-controls-composer');
composer.setDefaultTimeout(8000);
await composer.setViewportSize({width:1440,height:950});
await composer.emulateMedia({colorScheme:'light'});
await composer.goto(base+'?mode=list&shell=1');
await composer.waitForSelector('#V-PopupsCompose .squire-toolbar select.btn');
const select=await composer.evaluate(()=>{
 const el=document.querySelector('#V-PopupsCompose .squire-toolbar select.btn');
 const s=getComputedStyle(el);
 return {appearance:s.appearance,image:s.backgroundImage,radius:s.borderTopLeftRadius,
  tag:el.tagName,options:el.options.length,disabled:el.disabled};
});
check('The editing-mode menu drops the platform control for the theme chevron',
 select.appearance==='none'&&select.image!=='none');
check('It is still a native select with its options intact',
 select.tag==='SELECT'&&select.options>0&&!select.disabled);
console.log(JSON.stringify({passed:checks.length,checks}));
