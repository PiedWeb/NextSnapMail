const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-send-now');
p.setDefaultTimeout(8000);
await p.setViewportSize({width:1440,height:950});

// The notice only exists while a message is on its way. Build it from the markup the
// plugin itself ships, so a change to render() cannot leave this check passing.
const build=()=>p.evaluate(async()=>{
 document.querySelector('.pw-outgoing-notices')?.remove();
 const source=await (await fetch('/.local-work/pied-web-ux/background-send.js')).text();
 const markup=source.match(/job\.node\.innerHTML = '(.*)';/)[1];
 const holder=document.createElement('aside');holder.className='pw-outgoing-notices';
 const notice=document.createElement('div');notice.className='pw-outgoing-message';
 notice.innerHTML=markup;holder.append(notice);
 // placeHost() moves the notices into the topmost open dialog; outside it the
 // modal composer would leave every control inert and unfocusable.
 ([...document.querySelectorAll('dialog[open]')].at(-1)||document.querySelector('#rl-app')).append(holder);
 const now=notice.querySelector('.pw-outgoing-now');
 const template=document.createElement('template');
 template.innerHTML=PiedWebUx.composerIcons['send-horizontal'];
 const image=template.content.firstElementChild;
 image.setAttribute('aria-hidden','true');image.setAttribute('focusable','false');
 now.append(image);now.setAttribute('aria-label','Envoyer maintenant');now.title='Envoyer maintenant';
 now.hidden=false;
 const action=notice.querySelector('.pw-outgoing-action');
 action.textContent='Annuler ('+PiedWebUx.sendDelaySeconds+')';action.setAttribute('aria-label','Annuler l’envoi');
});

await p.emulateMedia({colorScheme:'light'});
await p.goto(base+'?mode=list&side=1&shell=1');
await p.waitForFunction(()=>window.PiedWebUx?.composerIcons&&window.PiedWebUx.createSendDelay);
check('The plugin ships the Lucide send glyph with the icon set',await p.evaluate(()=>{
 const svg=PiedWebUx.composerIcons['send-horizontal'];
 return typeof svg==='string'&&svg.startsWith('<svg')&&svg.includes('stroke="currentColor"');
}));
await build();
check('The pending notice offers Send now beside Undo, in that order',await p.evaluate(()=>{
 const notice=document.querySelector('.pw-outgoing-message');
 const nodes=[...notice.querySelectorAll('button')];
 return nodes.length===2&&nodes[0].classList.contains('pw-outgoing-now')
  &&nodes[1].classList.contains('pw-outgoing-action')
  &&nodes[0].type==='button'&&!!nodes[0].querySelector('svg');
}));
check('Send now is a 44 px target carrying a 20 px glyph',await p.evaluate(()=>{
 const now=document.querySelector('.pw-outgoing-now'),box=now.getBoundingClientRect();
 const glyph=now.querySelector('svg').getBoundingClientRect();
 return box.width>=44&&box.height>=44&&Math.round(glyph.width)===20&&Math.round(glyph.height)===20;
}));
check('It is named for assistive technology and on hover, and its glyph is not',await p.evaluate(()=>{
 const now=document.querySelector('.pw-outgoing-now');
 return now.getAttribute('aria-label')==='Envoyer maintenant'&&now.title==='Envoyer maintenant'
  &&now.querySelector('svg').getAttribute('aria-hidden')==='true'
  &&now.querySelector('svg').getAttribute('focusable')==='false';
}));
check('Undo keeps its label and countdown, unshortened, on the same line',await p.evaluate(()=>{
 const now=document.querySelector('.pw-outgoing-now').getBoundingClientRect();
 const action=document.querySelector('.pw-outgoing-action');
 const box=action.getBoundingClientRect();
 return action.scrollWidth<=Math.ceil(box.width)&&now.right<=box.left
  &&Math.abs(now.top-box.top)<box.height&&box.height>=44;
}));
// The rule carries an explicit display, which outranks the user-agent [hidden] rule.
check('The countdown ending hides Send now instead of leaving a dead control',await p.evaluate(()=>{
 const now=document.querySelector('.pw-outgoing-now');
 now.hidden=true;
 const hidden=getComputedStyle(now).display==='none'&&!now.getClientRects().length;
 now.hidden=false;
 return hidden&&getComputedStyle(now).display!=='none';
}));
check('Undo keeps the one filled surface; Send now rests on nothing',await p.evaluate(()=>{
 const resting=getComputedStyle(document.querySelector('.pw-outgoing-now')).backgroundColor;
 return /rgba\(0, 0, 0, 0\)|transparent/.test(resting)
  &&getComputedStyle(document.querySelector('.pw-outgoing-action')).backgroundColor!==resting;
}));
// The Nextcloud control sheet draws an !important border on every #rl-app button.
check('Neither control keeps a button border on the borderless notice',await p.evaluate(()=>
 [...document.querySelectorAll('.pw-outgoing-message button')]
  .every(b=>['Top','Right','Bottom','Left'].every(side=>parseFloat(getComputedStyle(b)['border'+side+'Width'])===0))));
// Keyboard first: the focus ring is only expected while the keyboard leads.
await p.locator('.pw-outgoing-now').press('ArrowDown');
check('A focused Send now shows a visible ring and takes on the action tint',await p.evaluate(()=>{
 const now=document.querySelector('.pw-outgoing-now'),style=getComputedStyle(now);
 return document.activeElement===now&&now.matches(':focus-visible')
  &&parseFloat(style.outlineWidth)>=2&&style.outlineStyle==='solid'
  &&!/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor);
}));

check('The glyph clears non-text contrast against the notice surface',await p.evaluate(()=>{
 // Computed colours can come back in any colour space; resolve them to sRGB.
 const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
 const lum=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);
  const [r,g,b]=ctx.getImageData(0,0,1,1).data;
  const f=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
 document.querySelector('.pw-outgoing-now').blur();
 const a=lum(getComputedStyle(document.querySelector('.pw-outgoing-now')).color);
 const b=lum(getComputedStyle(document.querySelector('.pw-outgoing-message')).backgroundColor);
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=3;
}));

// Skipping the wait must not skip the guarantee the wait exists for: a cancelled
// delay stays cancelled even once its deadline passes.
check('A cancelled delay never runs its send, before or after the deadline',await p.evaluate(()=>{
 let now=0,queue=[],sent=0;
 const delay=PiedWebUx.createSendDelay(()=>{},{now:()=>now,later:fn=>queue.push(fn),clear:()=>{queue=[];}});
 delay.start(()=>sent++);
 const pending=delay.pending();
 delay.cancel();
 now=PiedWebUx.sendDelaySeconds*1000+1000;queue.forEach(fn=>fn());
 return pending&&sent===0&&!delay.pending();
}));
check('The undo window is three seconds, counted down and served exactly once',await p.evaluate(()=>{
 let now=0,queue=[],sent=0,shown=[];
 const undoWindow=PiedWebUx.sendDelaySeconds*1000;
 const delay=PiedWebUx.createSendDelay(seconds=>shown.push(seconds),{now:()=>now,later:fn=>queue.push(fn),clear:()=>{queue=[];}});
 delay.start(()=>sent++);
 now=undoWindow-1;queue.shift()(); // A tick short of the deadline schedules the next one.
 const early=sent===0&&delay.pending();
 now=undoWindow;queue.shift()();
 return PiedWebUx.sendDelaySeconds===3&&shown[0]===3&&early
  &&sent===1&&!delay.pending()&&delay.cancel()===false;
}));

await p.emulateMedia({colorScheme:'dark'});
await p.goto(base+'?mode=list&side=1&shell=1');
await p.waitForFunction(()=>window.PiedWebUx?.composerIcons);
await build();
// The fixture root is pinned to data-themes="light", so the grey ramp resolves from the
// light tokens while the card below it turns dark. An absolute dark ratio read here would
// measure that artifact; what the fixture can prove is that the glyph follows the same
// theme token as the subject line instead of a colour of its own.
check('Dark mode leaves the glyph on the same quiet token as the subject line',await p.evaluate(()=>{
 const now=getComputedStyle(document.querySelector('.pw-outgoing-now')).color;
 const subject=getComputedStyle(document.querySelector('.pw-outgoing-subject')).color;
 const surface=getComputedStyle(document.querySelector('.pw-outgoing-message')).backgroundColor;
 return now===subject&&now!==surface&&!/rgba\(0, 0, 0, 0\)|transparent/.test(now);
}));
await p.emulateMedia({colorScheme:'light'});
await p.setViewportSize({width:390,height:844});
await p.goto(base+'?mode=list&side=1&shell=1');
await p.waitForFunction(()=>window.PiedWebUx?.composerIcons);
await build();
check('At 390 px both controls keep their targets and the subject gives way',await p.evaluate(()=>{
 const notice=document.querySelector('.pw-outgoing-message').getBoundingClientRect();
 const now=document.querySelector('.pw-outgoing-now').getBoundingClientRect();
 const action=document.querySelector('.pw-outgoing-action');
 const box=action.getBoundingClientRect(),subject=document.querySelector('.pw-outgoing-subject');
 return now.width>=44&&now.height>=44&&box.height>=44
  &&now.left>=notice.left&&box.right<=Math.ceil(notice.right)
  &&action.scrollWidth<=Math.ceil(box.width)
  &&getComputedStyle(subject).textOverflow==='ellipsis';
}));
console.log(JSON.stringify({passed:checks.length,checks}));
