// Fictional transport, current native fragments, real product adapters.
const p=await browser.getPage('mail-ui-refinements');p.setDefaultTimeout(7000);await p.bringToFront();
const base='http://127.0.0.1:8876/.local-work/';
let passed=0;
const check=(name,ok)=>{if(!ok)throw Error(name);passed++;console.log('PASS '+name);};
for(const theme of ['light','dark']){
 await p.emulateMedia({colorScheme:theme});
 for(const width of [320,390,799]){
  await p.setViewportSize({width,height:700});
  await p.goto(base+'images-native-preview.html?mode=reader&shell=1&listOnly=1');
  await p.waitForSelector('.pw-mobile-reader-ready');
  const label=theme+' '+width;
  check(label+': one row of primary reader controls, with separate 44px targets',await p.evaluate(()=>{
   const bar=document.querySelector('#V-MailMessageView>.top-toolbar');
   const boxes=[...bar.querySelectorAll('.btn')].filter(n=>!n.closest('menu')).map(n=>n.getBoundingClientRect()).filter(r=>r.width&&r.height);
   return bar.getBoundingClientRect().height<=60&&boxes.length===5&&boxes.every(a=>a.width>=44&&a.height>=44&&a.right<=innerWidth+1)
    &&boxes.every((a,i)=>boxes.every((b,j)=>i===j||a.right<=b.left+.5||b.right<=a.left+.5));
  }));
  check(label+': reading hides list actions and duplicate close, metadata remains readable',await p.evaluate(()=>{
   const hidden=n=>getComputedStyle(n).display==='none';
   return hidden(document.querySelector('.pw-search-toggle'))&&hidden(document.querySelector('.pw-mobile-header [data-pw-icon=compose]'))
    &&hidden(document.querySelector('.b-message>.messageItemHeader .close'))
    &&[...document.querySelectorAll('#messageItem>.messageItemHeader .informationShort,#messageItem>.messageItemHeader .date')].every(n=>parseFloat(getComputedStyle(n).fontSize)>=14);
  }));
  check(label+': an ordinary sender address uses the full line without an orphan character',await p.evaluate(()=>{
   const address=document.querySelector('.pw-sender-address');
   return parseFloat(getComputedStyle(address).fontSize)>=14&&address.getBoundingClientRect().width>=innerWidth-64
    &&address.getBoundingClientRect().height<=24;
  }));
  await p.evaluate(async()=>{
   const native=await(await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/MailMessageView.html')).text();
   const source=new DOMParser().parseFromString(native,'text/html');
   const attachments=document.importNode(source.querySelector('.attachmentsPlace'),true);
   attachments.querySelectorAll('[data-bind]').forEach(n=>n.removeAttribute('data-bind'));attachments.open=true;
   const name=attachments.querySelector('.attachmentName');name.textContent='Document-de-travail-avec-un-nom-très-long-et-sans-espace-pour-vérifier-la-lecture-sur-téléphone.pdf';
   attachments.querySelector('.attachmentIcon').classList.add('hasPreview');
   document.querySelector('.bodyText').before(attachments);
   const history=document.createElement('section');history.className='pw-conversation-before';
   history.innerHTML='<div class="pw-conversation-card"><button class="pw-conversation-card-toggle"><strong>UnePersonneDontLeNomTrèsLongNeDoitPasÉlargirLaConversationSurUnTéléphone</strong><time>22 octobre 2026 à 10:42</time><span class="pw-conversation-card-recipient">Destinataire fictif</span><span class="pw-conversation-card-summary">Un extrait de message lisible sur téléphone</span></button></div>';
   document.querySelector('.b-message').prepend(history);
  });
  check(label+': received attachment names wrap in a full-width phone list',await p.evaluate(()=>{
   const item=document.querySelector('.attachmentItem'),name=item.querySelector('.attachmentName');
   return item.getBoundingClientRect().right<=innerWidth&&getComputedStyle(name).whiteSpace==='normal'
    &&getComputedStyle(name).webkitLineClamp==='2'&&getComputedStyle(item.parentNode).gridTemplateColumns.split(' ').length===1;
  }));
  check(label+': long conversation senders and dates reflow without clipping the panel',await p.evaluate(()=>{
   const card=document.querySelector('.pw-conversation-card-toggle');
   return card.scrollWidth<=card.clientWidth+1&&card.getBoundingClientRect().right<=innerWidth
    &&parseFloat(getComputedStyle(card.querySelector('.pw-conversation-card-summary')).fontSize)>=14;
  }));
  await p.evaluate(()=>{
   window.copyNode=document.querySelector('.pw-copy-md');window.originalBody=document.querySelector('.bodyText').innerHTML;
   const button=document.createElement('button');button.className='btn pw-remind-message';button.dataset.pwIcon='clock';button.setAttribute('aria-label','Me le rappeler');
   window.reminderNode=button;window.reminderInvocations=0;button.addEventListener('click',()=>reminderInvocations++);
   document.querySelector('.pw-message-actions').append(button);
  });
  await p.waitForFunction(()=>reminderNode.closest('menu'));
  await p.evaluate(()=>document.querySelector('.pw-reader-menu menu').classList.add('show'));
  check(label+': secondary menu scrolls inside the screen and retains the same buttons',await p.evaluate(()=>{
   const menu=document.querySelector('.pw-reader-menu menu'),box=menu.getBoundingClientRect();
   return copyNode.closest('menu')===menu&&reminderNode.closest('menu')===menu&&menu.scrollHeight>menu.clientHeight
    &&box.width>150&&box.left>=0&&box.right<=innerWidth&&box.bottom<=innerHeight
    &&copyNode.getBoundingClientRect().width>150&&copyNode.getBoundingClientRect().height>=44;
  }));
  await p.locator('.pw-reader-menu .pw-remind-message').press('Enter');
  check(label+': keyboard invokes the original secondary command once',await p.evaluate(()=>reminderInvocations===1));
  await p.evaluate(()=>{document.querySelector('.pw-reader-menu menu').classList.remove('show');document.documentElement.style.fontSize='200%';});
  check(label+': enlarged reply actions wrap without horizontal overflow or changing mail HTML',await p.evaluate(()=>{
   const row=document.querySelector('.pw-reading-actions');
   const buttons=[...row.children].filter(n=>n.getBoundingClientRect().width);
   return getComputedStyle(row).flexWrap==='wrap'&&buttons.every(n=>n.getBoundingClientRect().right<=innerWidth+1)
    &&document.querySelector('.bodyText').innerHTML===originalBody&&document.documentElement.scrollWidth<=innerWidth;
  }));
  await p.evaluate(()=>document.documentElement.style.fontSize='');
  await p.evaluate(()=>document.documentElement.style.fontSize='15px');
  check(label+': the real Nextcloud 15px root still gives metadata at least 14px',await p.evaluate(()=>
   parseFloat(getComputedStyle(document.querySelector('#messageItem>.messageItemHeader .date')).fontSize)>=14));
  await p.evaluate(()=>document.documentElement.style.fontSize='');
  await p.setViewportSize({width:1440,height:900});
  await p.waitForFunction(()=>copyNode.closest('.pw-copy-md-group')&&reminderNode.closest('.pw-message-actions'));
  check(label+': desktop restores exact secondary nodes with no duplicate handlers',await p.evaluate(()=>
   document.querySelector('.pw-copy-md')===copyNode&&copyNode.closest('.pw-copy-md-group')
   &&document.querySelector('.pw-remind-message')===reminderNode&&reminderNode.closest('.pw-message-actions')
   &&document.querySelectorAll('.pw-copy-md,.pw-remind-message').length===2));
 }
 await p.setViewportSize({width:390,height:700});
 await p.goto(base+'images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=2');
 await p.waitForFunction(()=>document.querySelectorAll('.pw-global-row').length===5);
 check(theme+': global timestamp and tools share one line without floating button boxes',await p.evaluate(()=>{
  const row=document.querySelector('.pw-global-row'),time=row.querySelector('time'),tools=row.querySelector('.pw-row-actions');
  const a=time.getBoundingClientRect(),b=tools.getBoundingClientRect();
  return a.top<b.bottom&&a.bottom>b.top&&getComputedStyle(tools).boxShadow==='none'
   &&[...tools.querySelectorAll('button')].every(n=>n.getBoundingClientRect().height>=44)&&row.getBoundingClientRect().height<150;
 }));
 await p.goto(base+'images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=1');
 await p.waitForSelector('.messageListItem .subjectParent[title]');
 await p.evaluate(()=>messageList.pageCount(3));
 await p.waitForSelector('.e-paginator a');
 check(theme+': native subjects retain complete titles and pagination has touch names',await p.evaluate(()=>
  [...document.querySelectorAll('.messageListItem .subjectParent')].every(n=>n.title===n.textContent.trim())
  &&[...document.querySelectorAll('.e-paginator a')].every(n=>n.getAttribute('aria-label')&&n.getBoundingClientRect().height>=44)
  &&document.querySelector('.e-paginator .current').getAttribute('aria-current')==='page'));
 await p.evaluate(()=>{window.pageClicks=0;document.querySelector('.e-paginator a:nth-child(2)').addEventListener('click',()=>pageClicks++);});
 await p.locator('.e-paginator a:nth-child(2)').press('Space');
 check(theme+': pagination activates once from the keyboard and skips the current page',await p.evaluate(()=>pageClicks===1&&document.querySelector('.e-paginator .current').tabIndex===-1));
 await p.evaluate(()=>{
  window.nativeCancelCalls=0;listVM.cancelSearch=()=>{nativeCancelCalls++;const rows=messageList();rows.search='';messageList.valueHasMutated();};
  const rows=[];rows.search='introuvable';messageList(rows);document.querySelector('.listEmptyMessage').style.display='';
  // This fixture's rows are static: mirror the native foreach removing them.
  document.querySelectorAll('.messageListPlace').forEach(n=>n.style.display='none');
 });
 await p.waitForSelector('.pw-empty-clear:not([hidden])');await p.locator('.pw-empty-clear').click();
 check(theme+': empty native search clears through the native command once',await p.evaluate(()=>nativeCancelCalls===1&&document.querySelector('.pw-empty-clear').hidden));
 await p.goto(base+'native-components-fixture.html');await p.evaluate(()=>fixtureReady);
 await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>fixtureRender('User/SettingsGeneral'));
 check(theme+': settings keep a readable measure on wide displays',await p.evaluate(()=>fixtureRoot.getBoundingClientRect().width<=832));
 await p.setViewportSize({width:390,height:700});
 check(theme+': native form controls and checkbox labels keep phone touch height',await p.evaluate(()=>
  [...fixtureRoot.querySelectorAll('select,input:not([type=checkbox]):not([type=radio])')].every(n=>n.getBoundingClientRect().height>=44)
  &&[...fixtureRoot.querySelectorAll('label:has(input[type=checkbox])')].every(n=>n.getBoundingClientRect().height>=44)));
}
await p.emulateMedia({reducedMotion:'reduce'});
await p.goto(base+'images-native-preview.html?mode=list&shell=1&listOnly=1&accounts=2');
await p.waitForSelector('.pw-global-rows');
check('Reduced motion removes result transitions and unavailable pages do not imply waiting',await p.evaluate(()=>
 getComputedStyle(document.querySelector('.pw-global-rows')).transitionDuration==='0s'
 &&[...document.querySelectorAll('.pw-global-pager button:disabled')].every(n=>getComputedStyle(n).cursor==='default')));
console.log(JSON.stringify({passed}));
