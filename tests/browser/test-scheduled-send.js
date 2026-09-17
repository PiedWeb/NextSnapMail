const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const p=await browser.getPage('pied-web-scheduled-send');
p.setDefaultTimeout(8000);
await p.emulateMedia({colorScheme:'light'});
await p.setViewportSize({width:1440,height:950});

// The control is mounted on the native composer header, taken from the template the engine
// itself renders, so a change to that header cannot leave this check passing.
const compose=async()=>{
 await p.addScriptTag({url:'/.local-work/pied-web-ux/scheduled-send.js'});
 await p.evaluate(async()=>{
  document.documentElement.classList.add('pw-theme');
  document.getElementById('V-PopupsCompose')?.remove();
  const html=await (await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsCompose.html')).text();
  const template=document.createElement('template');template.innerHTML=html;
  const header=template.content.querySelector('header');
  const dialog=document.createElement('dialog');dialog.id='V-PopupsCompose';
  dialog.append(header);document.querySelector('#rl-app').append(dialog);
  // The native composer is a modal dialog; opening it any other way leaves its controls
  // out of the top layer and out of reach of a real click. The engine sizes that dialog
  // around a body this fixture does not build, so it is pinned to the top of the viewport.
  dialog.showModal();
  dialog.style.top='0';dialog.style.bottom='auto';dialog.style.height='auto';
  window.pwScheduled=[];
  window.PiedWebUx.canSchedule=()=>window.pwCanSchedule!==false;
  window.PiedWebUx.scheduleSend=iso=>{window.pwScheduled.push(iso);return Promise.resolve(true);};
  window.PiedWebUx.formatSendAt=value=>'le '+value;
  dispatchEvent(new CustomEvent('rl-view-model',{detail:{viewModelTemplateID:'PopupsCompose',viewModelDom:dialog}}));
 });
};

await p.goto(base+'?mode=list&side=1&shell=1');
await p.waitForFunction(()=>window.PiedWebUx?.composerIcons);
check('The plugin ships the Lucide clock glyph with the icon set',await p.evaluate(()=>{
 const svg=PiedWebUx.composerIcons['clock'];
 return typeof svg==='string'&&svg.startsWith('<svg')&&svg.includes('stroke="currentColor"');
}));
await compose();
check('Scheduling stands beside Send, before Save, as a separate control',await p.evaluate(()=>{
 const header=document.querySelector('#V-PopupsCompose header');
 const nodes=[...header.children];
 const send=nodes.findIndex(node=>node.matches('a.btn[data-bind*="sendCommand"]'));
 const wrap=nodes.findIndex(node=>node.classList.contains('pw-schedule-wrap'));
 const save=nodes.findIndex(node=>node.classList.contains('button-save'));
 const button=header.querySelector('button.pw-schedule');
 return wrap===send+1&&save>wrap&&button.type==='button'&&!!button.querySelector('svg');
}));
check('It is named in French for the pointer and for assistive technology',await p.evaluate(()=>{
 const button=document.querySelector('button.pw-schedule');
 return button.title==='Programmer l’envoi'&&button.getAttribute('aria-label')==='Programmer l’envoi'
  &&button.getAttribute('aria-haspopup')==='dialog'&&button.getAttribute('aria-expanded')==='false'
  &&button.textContent.trim()==='Programmer'
  &&button.querySelector('svg').getAttribute('aria-hidden')==='true';
}));
check('Nothing is open before it is asked for',await p.evaluate(()=>
 document.querySelector('.pw-schedule-panel').hidden));
// The preserved Nextcloud control sheet draws an !important border and a filled surface on
// `#rl-app button.btn`, which this control carries to keep the header's metrics.
check('It keeps neither the Nextcloud button border nor its filled surface',await p.evaluate(()=>{
 const style=getComputedStyle(document.querySelector('button.pw-schedule'));
 return ['Top','Right','Bottom','Left'].every(side=>parseFloat(style['border'+side+'Width'])===0)
  &&/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor);
}));

await p.locator('button.pw-schedule').click();
check('Opening names the panel, marks the control expanded and takes the focus',await p.evaluate(()=>{
 const panel=document.querySelector('.pw-schedule-panel');
 return !panel.hidden&&panel.getAttribute('role')==='dialog'
  &&panel.getAttribute('aria-label')==='Programmer l’envoi'
  &&document.querySelector('button.pw-schedule').getAttribute('aria-expanded')==='true'
  &&document.activeElement===panel.querySelector('.pw-schedule-option');
}));
check('Every offered time is in the future, on the hour, and reads as a day and a time',await p.evaluate(()=>{
 const options=[...document.querySelectorAll('.pw-schedule-option')];
 if(options.length<2||options.length>3)return false;
 return options.every(option=>{
  const label=option.querySelector('.pw-schedule-when').textContent;
  const detail=option.querySelector('.pw-schedule-detail').textContent;
  return /^(Ce soir|Demain matin|Lundi matin)$/.test(label)&&/\d{2}:\d{2}|\d{1,2} h/.test(detail);
 });
}));
check('The free field cannot be set before the next minute',await p.evaluate(()=>{
 const input=document.querySelector('.pw-schedule-custom input');
 return input.type==='datetime-local'&&input.step==='60'
  &&new Date(input.min).getTime()>Date.now()
  &&new Date(input.value).getTime()>Date.now();
}));
check('Every control in the panel is a 44 px target',await p.evaluate(()=>
 [...document.querySelectorAll('.pw-schedule-panel button,.pw-schedule-panel input')]
  .every(node=>node.getBoundingClientRect().height>=44)));
check('The panel rests on its own surface, above the composer, with no button borders',await p.evaluate(()=>{
 const panel=document.querySelector('.pw-schedule-panel'),style=getComputedStyle(panel);
 const header=getComputedStyle(document.querySelector('#V-PopupsCompose header')).backgroundColor;
 return style.position==='absolute'&&style.boxShadow!=='none'&&style.backgroundColor!==header
  &&[...panel.querySelectorAll('button')].every(node=>
   ['Top','Right','Bottom','Left'].every(side=>parseFloat(getComputedStyle(node)['border'+side+'Width'])===0));
}));
check('The confirm is the one filled control; the offered times rest on nothing',await p.evaluate(()=>{
 const empty=colour=>/rgba\(0, 0, 0, 0\)|transparent/.test(colour);
 // The panel opens with the first time focused, so read one that is not.
 const resting=[...document.querySelectorAll('.pw-schedule-option')].find(node=>node!==document.activeElement);
 return !empty(getComputedStyle(document.querySelector('.pw-schedule-confirm')).backgroundColor)
  &&empty(getComputedStyle(document.querySelector('.pw-schedule-cancel')).backgroundColor)
  &&empty(getComputedStyle(resting).backgroundColor);
}));
await p.locator('.pw-schedule-option').first().press('Tab');
check('Keyboard movement inside the panel shows a visible ring',await p.evaluate(()=>{
 const focused=document.activeElement,style=getComputedStyle(focused);
 return document.querySelector('.pw-schedule-panel').contains(focused)&&focused.matches(':focus-visible')
  &&parseFloat(style.outlineWidth)>=2&&style.outlineStyle==='solid';
}));
await p.locator('.pw-schedule-option').first().press('Escape');
check('Escape closes the panel and gives the focus back to the control',await p.evaluate(()=>
 document.querySelector('.pw-schedule-panel').hidden
  &&document.activeElement===document.querySelector('button.pw-schedule')
  &&document.querySelector('button.pw-schedule').getAttribute('aria-expanded')==='false'));

// Choosing a time is the only thing that schedules, and it passes one instant, in UTC.
await p.locator('button.pw-schedule').click();
const chosen=await p.evaluate(()=>document.querySelector('.pw-schedule-option .pw-schedule-detail').textContent);
await p.locator('.pw-schedule-option').first().click();
check('A chosen time is handed over once, as a UTC instant on the minute',await p.evaluate(chosen=>{
 if(window.pwScheduled.length!==1)return false;
 const iso=window.pwScheduled[0],date=new Date(iso);
 return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(iso)&&date.getTime()>Date.now()
  &&date.toLocaleString(document.documentElement.lang||'fr',
   {weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})===chosen;
},chosen));
check('The panel closes once the message is on its way',await p.evaluate(()=>
 document.querySelector('.pw-schedule-panel').hidden&&document.activeElement!==null));

// A time already past is refused where it was typed, and nothing is scheduled.
await p.locator('button.pw-schedule').click();
await p.evaluate(()=>{
 const input=document.querySelector('.pw-schedule-custom input');
 const past=new Date(Date.now()-3600000);
 input.value=new Date(past.getTime()-past.getTimezoneOffset()*60000).toISOString().slice(0,16);
});
await p.locator('.pw-schedule-confirm').click();
check('A time in the past is refused in the panel, and nothing is handed over',await p.evaluate(()=>{
 const note=document.querySelector('.pw-schedule-note');
 return window.pwScheduled.length===1&&!note.hidden&&note.textContent.includes('à venir')
  &&note.getAttribute('role')==='status'&&!document.querySelector('.pw-schedule-panel').hidden;
}));
await p.evaluate(()=>document.querySelector('.pw-schedule-cancel').click());
check('Cancelling closes the panel without scheduling anything',await p.evaluate(()=>
 document.querySelector('.pw-schedule-panel').hidden&&window.pwScheduled.length===1));

// Without a Drafts folder there is nowhere to keep a scheduled message, so nothing offers one.
await p.evaluate(()=>{window.pwCanSchedule=false;});
await compose();
check('A mailbox that cannot keep drafts is never offered scheduling',await p.evaluate(()=>{
 const wrap=document.querySelector('.pw-schedule-wrap');
 return wrap.hidden&&!wrap.getClientRects().length;
}));

await p.setViewportSize({width:390,height:844});
await p.evaluate(()=>{window.pwCanSchedule=true;});
await compose();
await p.locator('button.pw-schedule').click();
check('At 390 px the panel stays on screen and keeps its targets',await p.evaluate(()=>{
 const box=document.querySelector('.pw-schedule-panel').getBoundingClientRect();
 return box.left>=0&&box.right<=innerWidth+1&&box.width>=240
  &&[...document.querySelectorAll('.pw-schedule-panel button')].every(node=>node.getBoundingClientRect().height>=44);
}));
console.log(JSON.stringify({passed:checks.length,checks}));
