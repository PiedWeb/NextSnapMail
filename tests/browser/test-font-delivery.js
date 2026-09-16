const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-font-delivery');
p.setDefaultTimeout(9000);
await p.setViewportSize({width:1440,height:950});
await p.emulateMedia({colorScheme:'light'});
await p.goto(base+'?mode=list&side=1&shell=1&listOnly=1');
await p.waitForSelector('.messageListItem');
await p.evaluate(()=>document.fonts.ready);
const state=await p.evaluate(()=>{
 const faces=[...document.fonts].filter(f=>f.family.includes('Pied Web'));
 const el=document.querySelector('.messageListItem .senderParent');
 return {count:faces.length,
  statuses:faces.map(f=>f.status),
  weights:faces.map(f=>f.weight),
  display:faces.map(f=>f.display),
  ranges:faces.map(f=>f.unicodeRange),
  applied:getComputedStyle(el).fontFamily,
  ready:document.fonts.check('14px "Pied Web UI"')};
});
check('The family is declared once per script range, not once for everything',
 state.count===2&&new Set(state.ranges).size===2);
check('Both faces keep the full variable weight axis',
 state.weights.every(w=>w==='100 900'));
check('The Latin face is fetched and applied',
 state.ready&&state.statuses[0]==='loaded'&&state.applied.includes('Pied Web UI'));
check('The Latin-Extended face is not fetched until a glyph needs it',
 state.statuses[1]==='unloaded');
check('Both faces swap rather than block',state.display.every(d=>d==='swap'));
const sheet=await p.evaluate(async()=>{
 const css=await (await fetch('/.local-work/theme/style.css',{cache:'reload'})).text();
 return {bytes:css.length,base64:/base64,[A-Za-z0-9+/=]{500}/.test(css),
  urls:(css.match(/url\("[^"]*woff2"\)/g)||[])};
});
check('The stylesheet carries no font payload of its own',!sheet.base64);
check('It points at two cacheable files instead',sheet.urls.length===2);
check('The stylesheet is far smaller than the one that embedded the font',sheet.bytes<300000);
const ext=await p.evaluate(async()=>{
 // A Latin-Extended glyph must pull the second file and nothing else.
 const probe=document.createElement('span');
 probe.style.font='16px "Pied Web UI"';probe.textContent='ŁśžĞ';
 document.body.append(probe);
 await document.fonts.load('16px "Pied Web UI"','ŁśžĞ');
 const faces=[...document.fonts].filter(f=>f.family.includes('Pied Web'));
 probe.remove();
 return faces.map(f=>f.status);
});
check('Asking for a Latin-Extended glyph loads the second file on demand',
 ext[1]==='loaded');
console.log(JSON.stringify({passed:checks.length,checks}));
