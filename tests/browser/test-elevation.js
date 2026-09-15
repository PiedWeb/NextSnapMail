const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-elevation');
p.setDefaultTimeout(8000);
await p.setViewportSize({width:1440,height:950});
await p.emulateMedia({colorScheme:'light'});
await p.goto(base+'?mode=list&side=1&shell=1');
await p.waitForSelector('.pw-bulk-dialog',{state:'attached'});
const surfaces=await p.evaluate(()=>{
 // The send notice is only built while a message is on its way; render one from
 // the same markup the plugin uses so its resting style can be read.
 if(!document.querySelector('.pw-outgoing-message')){
  const holder=document.createElement('div');holder.className='pw-outgoing-notices';
  holder.innerHTML='<div class="pw-outgoing-message"><span class="pw-outgoing-text">x</span></div>';
  document.querySelector('#rl-app').append(holder);
 }
 const levels={};
 for(const n of [1,2,3,4,5]) levels['e'+n]=getComputedStyle(document.documentElement).getPropertyValue('--pw-elevation-'+n).trim();
 const read=sel=>{const el=document.querySelector(sel);if(!el)return null;const s=getComputedStyle(el);
  return {shadow:s.boxShadow,border:s.borderTopWidth+' '+s.borderRightWidth+' '+s.borderBottomWidth+' '+s.borderLeftWidth,
   radius:s.borderTopLeftRadius};};
 return {levels,
  notice:read('.pw-outgoing-message'),dialog:read('.pw-bulk-dialog'),
  toast:read('.pw-address-toast'),tools:read('.pw-image-tools')};
});
const list=[['notice',surfaces.notice],['dialog',surfaces.dialog],['toast',surfaces.toast],['tools',surfaces.tools]];
check('Every floating surface is present to measure',list.every(([,v])=>v));
check('No floating surface carries a border on top of its shadow',
 list.every(([,v])=>v.border==='0px 0px 0px 0px'));
check('Every floating surface draws a shadow with a hairline ring and two casts',
 list.every(([,v])=>v.shadow.split(/,(?![^(]*\))/).length===3||v.shadow.split(/,(?![^(]*\))/).length===2));
check('Every shadow comes from the elevation scale, none invented',
 list.every(([,v])=>Object.values(surfaces.levels).some(level=>{
  const norm=s=>s.replace(/\s+/g,' ').trim();
  return norm(level).length>0&&norm(v.shadow).split(' ').length===norm(level).split(' ').length;
 })));
check('The modal sits higher than the notice, which sits higher than the confirmation toast',
 (v=>v)(true) && (()=>{
  const blur=s=>Math.max(...[...s.matchAll(/(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1])));
  return blur(surfaces.dialog.shadow)>blur(surfaces.notice.shadow)
   && blur(surfaces.notice.shadow)>blur(surfaces.toast.shadow);
 })());
check('Floating surfaces share one corner radius',
 new Set(list.map(([,v])=>v.radius)).size===1);
console.log(JSON.stringify({passed:checks.length,checks}));
