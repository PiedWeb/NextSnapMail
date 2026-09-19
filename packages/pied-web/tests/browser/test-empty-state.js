const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-empty-state');
p.setDefaultTimeout(8000);
await p.setViewportSize({width:1440,height:950});
await p.emulateMedia({colorScheme:'light'});
await p.goto(base+'?mode=list&side=1&shell=1&listOnly=1');
await p.waitForSelector('.messageListItem');
// The engine empties the list and writes its own translated sentence into the
// native node; reproduce exactly that, without inventing copy.
const emptyOut=()=>p.evaluate(()=>{
 const content=document.querySelector('.messageList .b-content');
 content.querySelectorAll('.messageListItem,.pw-day-label,.groupLabel,.pw-unread-drafts').forEach(el=>el.remove());
 let empty=content.querySelector('.listEmptyMessage');
 if(!empty){empty=document.createElement('div');empty.className='listEmptyMessage';content.append(empty);}
 empty.removeAttribute('style');
 empty.textContent='Aucun message dans ce dossier';
});
await emptyOut();
await p.waitForFunction(()=>getComputedStyle(document.querySelector('.listEmptyMessage')).display==='flex');
const folder=await p.evaluate(()=>{
 const el=document.querySelector('.listEmptyMessage');
 const s=getComputedStyle(el),b=getComputedStyle(el,'::before');
 const pane=document.querySelector('.messageList .b-content').getBoundingClientRect();
 const box=el.getBoundingClientRect();
 return {display:s.display,align:s.alignItems,justify:s.justifyContent,minHeight:parseFloat(s.minHeight),
  glyph:{w:parseFloat(b.width),h:parseFloat(b.height),mask:b.maskImage,bg:b.backgroundColor},
  text:el.textContent,centred:Math.abs((box.left+box.right)/2-(pane.left+pane.right)/2)<2};
});
check('The empty folder is a designed state, not a bare line of text',
 folder.display==='flex'&&folder.align==='center'&&folder.justify==='center'&&folder.minHeight>=300);
check('It carries a quiet glyph above the sentence',
 folder.glyph.w===56&&folder.glyph.h===56&&folder.glyph.mask!=='none'&&folder.glyph.bg!=='rgba(0, 0, 0, 0)');
check('It sits in the middle of the list pane',folder.centred);
check('The sentence stays the engine translation, untouched',
 folder.text==='Aucun message dans ce dossier');
const inboxGlyph=folder.glyph.mask;
await p.evaluate(()=>{
 const s=document.querySelector('.inputSearch');
 s.value='facture';s.dispatchEvent(new Event('input',{bubbles:true}));
 document.querySelector('.listEmptyMessage').textContent='Aucun message ne correspond à cette recherche';
});
await p.waitForFunction(mask=>getComputedStyle(document.querySelector('.listEmptyMessage'),'::before').maskImage!==mask,inboxGlyph);
check('A search with no result says so with its own glyph',
 await p.evaluate(mask=>{
  const b=getComputedStyle(document.querySelector('.listEmptyMessage'),'::before');
  return b.maskImage!==mask&&b.maskImage!=='none';
 },inboxGlyph));
check('The search field is still there to clear',
 await p.evaluate(()=>{const s=document.querySelector('.inputSearch');
  const r=s.getBoundingClientRect();return getComputedStyle(s).display!=='none'&&r.width>0&&r.height>0;}));
await p.setViewportSize({width:390,height:900});
await p.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.listEmptyMessage'),'::before').width)===44);
check('The phone keeps the state, at phone scale',
 await p.evaluate(()=>{const el=document.querySelector('.listEmptyMessage');
  return getComputedStyle(el).display==='flex'&&el.getBoundingClientRect().right<=innerWidth;}));
console.log(JSON.stringify({passed:checks.length,checks}));
