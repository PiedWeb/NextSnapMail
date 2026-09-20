const p=await browser.getPage('nextsnapmail-list-polish');p.setDefaultTimeout(15000);
await p.setViewportSize({width:1440,height:950});await p.emulateMedia({colorScheme:'light'});
await p.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?drafts=1&mode=reader&side=1');await p.waitForSelector('.pw-draft-row');
await p.evaluate(async()=>{
 const source=await(await fetch('/app/snappymail/v/2.38.2/static/js/app.js')).text();
 const start=source.indexOf("this.selector.on('click', (event, currentMessage) => {");
 const end=source.indexOf("\n\t\t\tthis.selector.on('UpOrDown'",start);
 if(start<0||end<0)throw new Error('Native selector contract changed');
 window.metadataActions=[];window.metadataThreads=[];
 const MessagelistUserStore={listCheckedOrSelected:()=>demoMessages.filter(m=>m.checked())};
 const MessageSetAction={SetFlag:'set',UnsetFlag:'unset'};
 const listAction=(folder,action,messages)=>{metadataActions.push({folder,action,uids:messages.map(m=>m.uid)});messages.forEach(m=>{m.flagged=action==='set';demoRows[demoMessages.indexOf(m)].classList.toggle('msgflag-\\flagged',m.flagged);});};
 let nativeClick;const receiver={selector:{on:(name,fn)=>nativeClick=fn},gotoThread:m=>metadataThreads.push(m.uid)};
 Function('MessagelistUserStore','MessageSetAction','listAction',source.slice(start,end)).call(receiver,MessagelistUserStore,MessageSetAction,listAction);
 demoRows.forEach((row,i)=>{
  demoMessages[i].flagged=i===1;demoMessages[i].isFlagged=()=>demoMessages[i].flagged;
  row.classList.toggle('msgflag-\\flagged',demoMessages[i].flagged);
  row.addEventListener('click',event=>nativeClick(event,demoMessages[i]));
  if(i>2)return;
  const count=document.createElement('div');count.className='threads-len';count.textContent=i===0?'13/4':i===1?'8':'24/2';
  if(i!==1)count.dataset.unseen=i===0?'4':'2';
  row.querySelector('.subjectParent').after(count);row.querySelector('.attachmentParent').innerHTML='<i class="icon-file-image"></i>';row.querySelector('time').textContent='09 sept.';
 });
});
await p.waitForSelector('.threads-len[data-pw-total]');
const results=[];const check=(name,ok)=>{if(!ok)throw new Error(name);results.push(name);console.log('PASS '+name);};
check('Native count text is preserved; accessible label explains total and unread',await p.evaluate(()=>{const b=document.querySelector('.threads-len');return b.textContent==='13/4'&&b.dataset.pwTotal==='13'&&b.dataset.pwUnread==='4 non lus'&&b.getAttribute('aria-label').includes('13 messages, dont 4 non lus');}));
check('A followed row carries an edge accent, not a full surface, and never outshines the open message',await p.evaluate(()=>{
 const rows=document.querySelectorAll('.messageListItem');
 const flagged=rows[1],plain=rows[2],open=rows[0];
 const accent=getComputedStyle(flagged,'::before');
 const clear=c=>c==='rgba(0, 0, 0, 0)'||c==='transparent';
 return getComputedStyle(flagged).backgroundColor===getComputedStyle(plain).backgroundColor
  &&clear(getComputedStyle(flagged).backgroundColor)
  &&open.classList.contains('selected')&&!clear(getComputedStyle(open).backgroundColor)
  &&accent.content==='""'&&accent.position==='absolute'&&parseFloat(accent.width)===3
  &&!clear(accent.backgroundColor)&&getComputedStyle(plain,'::before').content==='none';
}));
check('The star keeps one glyph size whether or not the message is followed',await p.evaluate(()=>{
 const rows=document.querySelectorAll('.messageListItem');
 const a=getComputedStyle(rows[0].querySelector('.flagParent'),'::after');
 const b=getComputedStyle(rows[1].querySelector('.flagParent'),'::after');
 return a.width===b.width&&a.height===b.height&&parseFloat(a.width)===19;
}));
check('Desktop keeps the flagged star visible and reserves the unflagged hit area',await p.evaluate(()=>{const rows=document.querySelectorAll('.messageListItem'),plain=rows[0].querySelector('.flagParent'),flagged=rows[1].querySelector('.flagParent');return getComputedStyle(plain).opacity==='0'&&getComputedStyle(flagged).opacity==='1'&&plain.getBoundingClientRect().width>=31.9;}));
await p.locator('.messageListItem').first().hover();
await p.waitForFunction(()=>getComputedStyle(document.querySelector('.messageListItem .flagParent')).opacity==='1');
check('Hover reveals the unflagged star',await p.evaluate(()=>getComputedStyle(document.querySelector('.messageListItem .flagParent')).opacity==='1'));
await p.locator('.messageListItem .flagParent').first().click();await p.waitForFunction(()=>document.querySelector('.messageListItem .flagParent').getAttribute('aria-pressed')==='true');
check('Pointer click uses the original native flag dispatcher once',await p.evaluate(()=>metadataActions.length===1&&metadataActions[0].action==='set'&&metadataActions[0].uids.join(',')==='1'));
await p.locator('.messageListItem .flagParent').first().press('Space');
check('Keyboard Space uses the original native unflag command once',await p.evaluate(()=>metadataActions.length===2&&metadataActions[1].action==='unset'));
await p.locator('.threads-len').first().press('Enter');
check('Keyboard Enter opens the intended native conversation',await p.evaluate(()=>metadataThreads.join(',')==='1'));
await p.evaluate(()=>{demoMessages[0].checked(true);demoMessages[1].checked(true);});await p.locator('.messageListItem .flagParent').first().click();
check('Native multi-selection flag semantics remain unchanged',await p.evaluate(()=>metadataActions[2].uids.join(',')==='1,2'));
await p.evaluate(()=>{const b=document.querySelector('.threads-len');b.textContent='13';b.removeAttribute('data-unseen');});await p.waitForFunction(()=>document.querySelector('.threads-len').dataset.pwUnread==='');
check('Reading the conversation clears its unread label',await p.evaluate(()=>!document.querySelector('.threads-len').title.includes('non lu')));
await p.evaluate(()=>document.querySelector('.threads-len').style.display='none');
check('Native hidden counts remain hidden',await p.evaluate(()=>document.querySelector('.threads-len').getClientRects().length===0));
await p.evaluate(()=>{document.querySelector('.threads-len').style.display='';document.documentElement.lang='en';});await p.waitForFunction(()=>document.querySelector('.threads-len').title.startsWith('Open conversation'));
check('Labels follow the interface language',await p.evaluate(()=>document.querySelector('.messageListItem .flagParent').title==='Remove star'));
await p.evaluate(()=>{document.querySelector('link[href*="theme/style.css"]').disabled=true;document.documentElement.classList.remove('pw-theme');});await p.waitForFunction(()=>!document.querySelector('.threads-len').hasAttribute('data-pw-total'));
check('Leaving the theme restores native attributes and removes desktop read controls',await p.evaluate(()=>!document.querySelector('.threads-len').hasAttribute('role')&&!document.querySelector('.messageListItem .flagParent').hasAttribute('tabindex')&&!document.querySelector('.pw-read-toggle')));
await p.evaluate(()=>{document.documentElement.lang='fr';document.querySelector('link[href*="theme/style.css"]').disabled=false;document.documentElement.classList.add('pw-theme');demoMessages.forEach((m,i)=>{m.checked(false);m.flagged=i===1;demoRows[i].classList.toggle('msgflag-\\flagged',m.flagged);});const b=document.querySelector('.threads-len');b.textContent='13/4';b.dataset.unseen='4';});await p.waitForSelector('.threads-len[data-pw-total]');
await p.locator('.threads-len').first().blur();await p.screenshot({path:'list-metadata-desktop.png'});
for(const [width,dark] of [[390,false],[320,false],[390,true]]){
 await p.setViewportSize({width,height:900});await p.emulateMedia({colorScheme:dark?'dark':'light'});
 await p.evaluate(dark=>{document.documentElement.dataset.themes=dark?'dark':'light';document.getElementById('V-MailMessageView').hidden=true;document.getElementById('rl-right').classList.remove('message-selected');},dark);
 check('Mobile geometry '+width+(dark?' dark':''),await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.messageListItem .flagParent')].every(b=>{const r=b.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&r.right<=innerWidth;})));
 if(width===390&&!dark)check('Phone metadata steps behind the sender, and the unread dot yields to the spelled-out count',await p.evaluate(()=>{
  const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  const lum=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);
   const [r,g,b]=ctx.getImageData(0,0,1,1).data;
   const f=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
   return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  const rows=[...document.querySelectorAll('.messageListItem')];
  const sender=lum(getComputedStyle(rows[0].querySelector('.senderParent')).color);
  const clip=lum(getComputedStyle(rows[0].querySelector('.attachmentParent')).color);
  const plainStar=lum(getComputedStyle(rows[2].querySelector('.flagParent')).color);
  const withCount=rows.find(r=>r.classList.contains('unseen')&&r.querySelector('.threads-len[data-pw-unread]:not([data-pw-unread=""])'));
  const withoutPill=rows.find(r=>r.classList.contains('unseen')&&!r.querySelector('.threads-len'));
  if(!withCount||!withoutPill)return false;
  const dot=el=>getComputedStyle(el.querySelector('time'),'::before').display;
  return clip>sender&&plainStar>sender&&dot(withCount)==='none'&&dot(withoutPill)!=='none';
 }));
 if(width===320)check('Narrow phones keep the sender above conversation metadata',await p.evaluate(()=>{const row=document.querySelector('.messageListItem');return row.querySelector('.senderParent').getBoundingClientRect().width>=100&&row.querySelector('.threads-len').getBoundingClientRect().top>=row.querySelector('.subjectParent').getBoundingClientRect().bottom;}));
 await p.screenshot({path:'list-metadata-'+(dark?'dark':width===320?'320':'mobile')+'.png'});
}
check('No runtime errors',await p.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:results.length,results},null,2));
