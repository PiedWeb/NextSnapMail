const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-composer-actions');
p.setDefaultTimeout(8000);
await p.setViewportSize({width:1440,height:950});
await p.emulateMedia({colorScheme:'light'});
await p.goto(base+'?mode=list&shell=1');
await p.waitForSelector('#V-PopupsCompose header a.btn.button-delete');
// The composer view model is announced after the dialog markup exists.
await p.waitForFunction(()=>document.querySelector('#V-PopupsCompose header a.btn.button-delete').hasAttribute('aria-label'));
const read=()=>p.evaluate(()=>{
 const header=document.querySelector('#V-PopupsCompose header');
 const send=header.querySelector('a.btn:has(> .icon-paper-plane'.concat(')'));
 const save=header.querySelector('a.btn.button-save');
 const discard=header.querySelector('a.btn.button-delete');
 const of=el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color,border:s.borderTopColor,
  borderWidth:s.borderTopWidth,radius:s.borderTopLeftRadius,weight:s.fontWeight,
  label:el.getAttribute('aria-label')||'',title:el.title||''};};
 const lum=c=>{const m=c.match(/[\d.]+/g);if(!m)return 1;const [r,g,b]=m.map(Number);
  const f=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
 return {send:of(send),save:of(save),discard:of(discard),
  sendLum:lum(getComputedStyle(send).backgroundColor),
  saveLum:lum(getComputedStyle(save).backgroundColor),
  discardLum:lum(getComputedStyle(discard).backgroundColor),
  discardAlpha:(getComputedStyle(discard).backgroundColor.match(/[\d.]+/g)||[0,0,0,1])[3]};
});
const state=await read();
check('Send is the only filled action in the composer header',
 state.sendLum<0.35 && state.send.color==='rgb(255, 255, 255)' && state.send.border==='rgba(0, 0, 0, 0)');
check('Save is a tertiary ghost action, not a second completion button',
 state.save.bg==='rgba(0, 0, 0, 0)' && state.save.border==='rgba(0, 0, 0, 0)'
 && state.save.color!==state.send.color);
check('Discard is a quiet ghost control at rest, never a red block',
 state.discard.bg==='rgba(0, 0, 0, 0)' && state.discard.border==='rgba(0, 0, 0, 0)'
 && state.discard.color!=='rgb(255, 255, 255)');
check('Discard carries the native translation as its accessible name',
 state.discard.label.length>0 && state.discard.label===state.discard.title
 && /supprimer|delete/i.test(state.discard.label));
await p.locator('#V-PopupsCompose header a.btn.button-delete').hover();
await p.waitForFunction(()=>getComputedStyle(document.querySelector('#V-PopupsCompose header a.btn.button-delete')).backgroundColor!=='rgba(0, 0, 0, 0)');
const hovered=await p.evaluate(()=>{
 const el=document.querySelector('#V-PopupsCompose header a.btn.button-delete');
 const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color};});
check('Discard turns red only under the pointer',
 hovered.bg!=='rgba(0, 0, 0, 0)' && hovered.color!==state.discard.color);
check('The three actions share one corner radius',
 state.send.radius===state.save.radius && state.save.radius===state.discard.radius);
const native=await p.evaluate(()=>{
 const header=document.querySelector('#V-PopupsCompose header');
 return {send:!!header.querySelector('a.btn > .icon-paper-plane'),
  save:!!header.querySelector('a.btn.button-save'),
  discard:header.querySelector('a.btn.button-delete').textContent.trim()};});
check('Native commands, markup and glyph are untouched',
 native.send && native.save && native.discard==='🗑');

const utilities=await p.evaluate(()=>{
 const nodes=[
  document.querySelector('#V-PopupsCompose header .pull-right > a[data-i18n*="GLOBAL/CONTACTS"]'),
  document.querySelector('#V-PopupsCompose header .pull-right > .dropdown > .dropdown-toggle'),
  document.querySelector('#V-PopupsCompose header .minimize-custom'),
  document.querySelector('#V-PopupsCompose header .close')
 ];
 return nodes.map(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return {
  width:box.width,height:box.height,label:node.getAttribute('aria-label'),role:node.getAttribute('role'),
  tabIndex:node.tabIndex,bg:style.backgroundColor,color:style.color
 };});
});
check('Header utilities share a quiet 36 px square target',utilities.every(control=>
 control.width===36&&control.height===36&&control.bg==='rgba(0, 0, 0, 0)'));
check('Contacts, options, minimize and close are named keyboard controls',utilities.every(control=>
 control.label&&control.role==='button'&&control.tabIndex===0));
check('Space activates a native link promoted to a keyboard control',await p.evaluate(()=>{
 const control=document.querySelector('#V-PopupsCompose header .minimize-custom');let clicks=0;
 control.addEventListener('click',()=>clicks++,{once:true});control.focus();
 control.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
 return clicks===1;
}));
console.log(JSON.stringify({passed:checks.length,checks}));
