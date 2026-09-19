const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const p=await browser.getPage('pied-web-reply-priority');p.setDefaultTimeout(7000);
await p.setViewportSize({width:1280,height:820});
await p.goto(base+'?mode=reader&side=1');
await p.waitForSelector('.pw-reading-actions');
await p.evaluate(()=>document.querySelector('#V-PopupsCompose')?.close());
const checks=[];const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};

check('Reply all leads and is emphasized when it targets several correspondents',await p.evaluate(()=>{
 const group=document.querySelector('.pw-message-actions');
 const preferred=group.querySelector('.pw-preferred-reply');
 const first=group.querySelector(':scope > .btn');
 const style=getComputedStyle(preferred);
 return group.classList.contains('pw-reply-all-preferred')&&preferred.classList.contains('pw-reply-all')
  &&first===preferred&&style.backgroundColor!==getComputedStyle(group.querySelector('.pw-reply')).backgroundColor;
}));
check('The bottom primary becomes Reply all with an icon and keeps Forward secondary',await p.evaluate(()=>{
 const replyAll=document.querySelector('.pw-reading-reply-all');
 const reply=document.querySelector('.pw-reading-reply-one');
 const forward=document.querySelector('.pw-reading-forward');
 const icon=getComputedStyle(replyAll,'::before');
 return getComputedStyle(replyAll).display.includes('flex')&&getComputedStyle(reply).display==='none'
  &&replyAll.textContent.trim()==='Répondre à tous'&&icon.maskImage!=='none'
  &&getComputedStyle(forward).display.includes('flex')
  &&getComputedStyle(replyAll).backgroundColor!==getComputedStyle(forward).backgroundColor;
}));
await p.locator('.pw-reading-reply-all').click();
await p.locator('.pw-reading-forward').click();
check('Bottom actions still dispatch the native Reply all and Forward commands',await p.evaluate(()=>
 actionCalls.includes('replyAll')&&actionCalls.includes('forward')));

await p.evaluate(()=>readerVM.message({folder:'INBOX',subject:ko.observable('Message direct'),
 from:[{name:'Camille Martin',email:'camille@example.test'}],to:[{name:'Alex Nguyen',email:'alex@example.test'}],
 cc:[],bcc:[],replyTo:[],unsubsribeLinks:ko.observableArray([])}));
await p.waitForFunction(()=>document.querySelector('.pw-message-actions > .btn')?.classList.contains('pw-reply')
 &&getComputedStyle(document.querySelector('.pw-reading-reply-one')).display!=='none');
check('A direct message keeps Reply first and changes the bottom primary back to Reply',await p.evaluate(()=>{
 const group=document.querySelector('.pw-message-actions');
 const reply=group.querySelector('.pw-reply');
 return !group.classList.contains('pw-reply-all-preferred')&&group.firstElementChild===reply
  &&reply.classList.contains('pw-preferred-reply')
  &&getComputedStyle(document.querySelector('.pw-reading-reply-one')).display.includes('flex')
  &&getComputedStyle(document.querySelector('.pw-reading-reply-all')).display==='none';
}));
await p.locator('.pw-reading-reply-one').click();
check('The direct-message primary still dispatches the native Reply command',await p.evaluate(()=>actionCalls.includes('reply')));

await p.evaluate(()=>{
 document.documentElement.dataset.themes='dark';
 readerVM.message({folder:'INBOX',subject:ko.observable('Message de groupe'),
  from:[{name:'Camille Martin',email:'camille@example.test'}],to:[{name:'Alex Nguyen',email:'alex@example.test'}],
  cc:[{name:'Marie Dupont',email:'marie@example.test'}],bcc:[],replyTo:[],unsubsribeLinks:ko.observableArray([])});
});
await p.waitForFunction(()=>document.querySelector('.pw-message-actions')?.classList.contains('pw-reply-all-preferred'));
check('Dark mode keeps the preferred group action distinct from Reply',await p.evaluate(()=>{
 const all=document.querySelector('.pw-reply-all'),reply=document.querySelector('.pw-reply');
 return getComputedStyle(all).backgroundColor!==getComputedStyle(reply).backgroundColor
  &&getComputedStyle(all).color!==getComputedStyle(reply).color;
}));

await p.setViewportSize({width:390,height:844});
check('Reply actions keep touch targets and fit the narrow reader',await p.evaluate(()=>{
 const footer=document.querySelector('.pw-reading-actions');
 const visible=[...footer.querySelectorAll('.btn')].filter(button=>getComputedStyle(button).display!=='none');
 return visible.every(button=>button.getBoundingClientRect().height>=44)
  &&footer.getBoundingClientRect().right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;
}));
console.log(JSON.stringify({passed:checks.length,checks}));
