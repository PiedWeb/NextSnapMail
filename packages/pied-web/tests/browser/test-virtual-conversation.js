const fixtureBase=globalThis.PW_FIXTURE_URL||'http://127.0.0.1:8876';
const p=await browser.getPage('nextsnapmail-reader-conversation');p.setDefaultTimeout(7000);
let previewNetworkRequests=0;
await p.route('https://tracker.example.test/**',route=>{++previewNetworkRequests;return route.abort();});
await p.setViewportSize({width:1280,height:900});
await p.goto(fixtureBase+'/.local-work/images-native-preview.html?drafts=1&mode=reader&side=1');
await p.bringToFront();
await p.waitForFunction(()=>window.draftsReady);
await p.evaluate(()=>{
    document.documentElement.classList.add('pw-theme');
    const get=rl.settings.get;
    window.threadAccount='fixture-A';window.conversations=false;
    rl.settings.get=k=>k==='SentFolder'?'Sent':k==='accountHash'?threadAccount
        :k==='DraftsFolder'?'Drafts':k==='JunkFolder'?'Junk':k==='TrashFolder'?'Trash'
        :k==='useThreads'?conversations:k==='threadAlgorithm'?'REFERENCES':get(k);
    const email=(name,address)=>({'@Object':'Object/Email',name,email:address});
    const raw=(folder,uid,id,parent,refs,subject,date,plain,from)=>({'@Object':'Object/Message',folder,uid,
        hash:folder+'-'+uid,flags:['\\seen'],messageId:id,inReplyTo:parent,references:refs,
        subject,dateTimestamp:date,plain,html:'',to:[email('Alex','alex@example.test')],
        from:[email(from,'camille@example.test')],replyTo:[],cc:[],bcc:[],headers:[],attachments:[]});
    window.sourceRaw=raw('INBOX',11,'<root@example.test>','','','Projet Alpha',1789000000,'Premier message','Camille');
    window.receivedRaw=raw('INBOX',12,'<received-two@example.test>','<root@example.test>','<root@example.test>','Re: Projet Alpha',1789000200,'Réponse reçue','Camille');
    window.sentMatches=[
        raw('Sent',31,'<sent-one@example.test>','<root@example.test>','<root@example.test>','<img src=x onerror=alert(1)>',1789000100,'Première réponse envoyée','Alex'),
        raw('Sent',32,'<sent-two@example.test>','<sent-one@example.test>','<root@example.test> <sent-one@example.test>','Re: Projet Alpha',1789000300,'Dernière réponse envoyée','Alex')
    ];
    sentMatches[0].plain='';
    sentMatches[0].html='<p>Première réponse <strong>envoyée</strong></p><script>indésirable()</script><img src="https://tracker.example.test/pixel">';
    const collection=NativeDraftCollection.reviveFromJson([sourceRaw]);collection.folder='INBOX';
    collection[0].threads([11,12]);listVM.messageList(collection);
    readerVM.message(collection[0]);readerVM.messageLoadingThrottle=ko.observable(false);
    document.querySelector('#messageItem > .bodyText').textContent=sourceRaw.plain;
    window.threadRequests=[];window.nativeOpens=[];window.failThreadSearch=false;window.holdThreadSearch=false;
    listVM.selector={oCallbacks:{ItemSelect(model){
        nativeOpens.push({folder:model.folder,uid:model.uid});readerVM.message(model);
        const all=threadRows();
        document.querySelector('.messageView').scrollTop=0;
        document.querySelector('#messageItem > .bodyText').textContent=all.find(item=>item.folder===model.folder&&item.uid===model.uid)?.plain||'';
    }}};
    window.threadRows=()=>[sourceRaw,receivedRaw,...sentMatches,...(window.thirdReceived?[thirdReceived]:[])];
    rl.app.Remote.post=async(action,trigger,params)=>{
        threadRequests.push({action,folder:params.folder,uid:params.uid,account:threadAccount});
        return {Result:structuredClone(threadRows().find(item=>item.folder===params.folder&&item.uid===params.uid)||{})};
    };
    // Since 1.7.31 the stack is assembled by the PiedWebConversation plugin hook
    // on one IMAP connection; the reader sends the folder state it was given back.
    const otherHooks=rl.pluginRemoteRequest;
    rl.pluginRemoteRequest=(callback,action,params)=>{
        if(action!=='PiedWebConversation')return otherHooks(callback,action,params);
        threadRequests.push({action,folder:params.folder,uid:params.uid,threadUid:params.threadUid,
            etag:params.etag,scope:params.scope,account:threadAccount});
        const answer=()=>{
            if(failThreadSearch)return callback(0,{Result:{error:'conversation'}});
            if(window.partialThreadSearch)return callback(0,{Result:{etag:'',messages:[],partial:true}});
            const all=threadRows(),anchors=new Set([params.messageId,params.inReplyTo,
                ...String(params.references||'').split(/\s+/)].filter(Boolean));
            for(let size=-1;size!==anchors.size;){
                size=anchors.size;
                for(const item of all)
                    if([...anchors].some(id=>item.messageId===id||String(item.references).includes(id)
                        ||String(item.inReplyTo).includes(id))) anchors.add(item.messageId);
            }
            const rows=all.filter(item=>anchors.has(item.messageId));
            const etag=rows.map(item=>item.folder+item.uid).join(' ');
            callback(0,{Result:params.etag===etag?{etag,unchanged:true,messages:[]}
                :{etag,unchanged:false,messages:structuredClone(rows)}});
        };
        if(holdThreadSearch)window.releaseThreadSearch=answer;else setTimeout(answer,20);
    };
    ko.applyBindingAccessorsToNode(document.getElementById('V-MailMessageList'),{css:()=>({})},listVM);
    ko.applyBindingAccessorsToNode(document.getElementById('V-MailMessageView'),{css:()=>({})},readerVM);
    window.nativeReaderInterval=setInterval;
    window.setInterval=(handler,delay,...args)=>{
        if(delay===60000)window.readerPoll=handler;
        return nativeReaderInterval(handler,delay,...args);
    };
});
await p.addScriptTag({url:fixtureBase+'/.local-work/pied-web-ux/conversation-thread.js'});
await p.waitForFunction(()=>readerVM.pwConversationThread===true);
await p.evaluate(()=>{window.setInterval=nativeReaderInterval;delete window.nativeReaderInterval;});

const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const control=p.locator('.pw-conversation-full');
const history=p.locator('.pw-conversation-history');
const latest=history.getByRole('button',{name:'Afficher le dernier message'});
const openHistory=async expected=>{
    await control.click();
    await p.waitForFunction(count=>!document.querySelector('.pw-conversation-history').hidden
        &&document.querySelectorAll('.pw-conversation-card').length===count,expected);
};
const waitForCount=async expected=>p.waitForFunction(count=>
    document.querySelector('.pw-conversation-count')?.textContent===String(count),expected);
await waitForCount(4);
check('An Inbox lookup keeps the requested message readable regardless of native list grouping',await p.evaluate(()=>
    readerVM.message()?.uid===11 && document.querySelector('#messageItem > .bodyText').textContent===sourceRaw.plain
    &&rl.settings.get('useThreads')===false&&nativeOpens.length===0));
check('The count resolves while the history stays closed and requests no message bodies',await p.evaluate(()=>
    document.querySelector('.pw-conversation-history').hidden&&!document.querySelector('.pw-conversation-card')
    &&threadRequests.length===1&&threadRequests[0].action==='PiedWebConversation'&&threadRequests[0].scope==='inbox'));
await p.evaluate(()=>readerPoll());
check('A closed conversation makes no periodic IMAP request',await p.evaluate(()=>threadRequests.length===1));
await control.focus();
await p.keyboard.press('Enter');
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-card').length===3);
check('Keyboard activation focuses the named history below the native body',await p.evaluate(()=>{
    const panel=document.querySelector('.pw-conversation-history'),button=document.querySelector('.pw-conversation-full');
    return document.activeElement===panel.querySelector('h2')&&button.getAttribute('aria-controls')===panel.id
        &&button.getAttribute('aria-expanded')==='true'
        &&Boolean(document.getElementById('messageItem').compareDocumentPosition(panel)&Node.DOCUMENT_POSITION_FOLLOWING);
}));
check('Both received and Sent messages appear chronologically without opening another native message',await p.evaluate(()=>
    [...document.querySelectorAll('.pw-conversation-card')].map(node=>Number(node.dataset.key.split('\u0000').at(-1))).join(',')==='31,12,32'
    &&nativeOpens.length===0));
check('A folded message has one border, and native Close sits beside the toolbar arrows',await p.evaluate(()=>{
    const card=document.querySelector('.pw-conversation-card'),button=card.querySelector('button');
    const close=document.querySelector('#V-MailMessageView .top-toolbar .buttonClose');
    const next=document.querySelector('#V-MailMessageView .top-toolbar .buttonDown');
    const subjectClose=document.querySelector('.b-message > .messageItemHeader .subjectParent > .close');
    const gap=close.getBoundingClientRect().left-next.getBoundingClientRect().right;
    return getComputedStyle(card).borderTopWidth!=='0px'&&getComputedStyle(button).borderTopWidth==='0px'
        &&getComputedStyle(close).display!=='none'&&gap>=0&&gap<=12&&getComputedStyle(subjectClose).display==='none';
}));
check('HTML excerpts become inert single-line text and do not load tracking pixels',await p.evaluate(()=>
    !document.querySelector('.pw-conversation-card img,.pw-conversation-card script')
    &&[...document.querySelectorAll('.pw-conversation-card-summary')].some(node=>node.textContent==='Première réponse envoyée')
    &&getComputedStyle(document.querySelector('.pw-conversation-card-summary')).whiteSpace==='nowrap')&&previewNetworkRequests===0);
await p.evaluate(()=>readerPoll());
await p.waitForFunction(()=>threadRequests.filter(r=>r.action==='PiedWebConversation').length===2);
check('The open Inbox history reuses the freshness token on the periodic lookup',await p.evaluate(()=>!!threadRequests.at(-1).etag));
await p.locator('.pw-conversation-card-toggle').nth(1).click();
await p.waitForFunction(()=>readerVM.message()?.uid===12&&document.querySelector('.pw-conversation-history').hidden);
check('Opening a historical message puts its native body and actions first',await p.evaluate(()=>
    document.querySelector('#messageItem > .bodyText').textContent==='Réponse reçue'
    &&document.querySelector('.messageView').scrollTop===0
    &&document.activeElement===document.querySelector('.pw-conversation-full')));
await openHistory(3);
const missingPreview=history.getByRole('button',{name:'Charger l’aperçu'}).first();
await missingPreview.click();
await p.waitForFunction(()=>[...document.querySelectorAll('.pw-conversation-card-summary')].some(node=>node.textContent==='Premier message'));
check('A missing excerpt is fetched on demand and remains a plain preview',await p.evaluate(()=>
    threadRequests.some(request=>request.action==='Message'&&request.uid===11)
    &&!document.querySelector('.pw-conversation-preview:not([hidden])')&&readerVM.message()?.uid===12));
await latest.click();
await p.waitForFunction(()=>readerVM.message()?.folder==='Sent'&&readerVM.message()?.uid===32);
check('The latest reply is an explicit native open and closes the history',await p.evaluate(()=>
    document.querySelector('#messageItem > .bodyText').textContent==='Dernière réponse envoyée'
    &&document.querySelector('.pw-conversation-history').hidden&&nativeOpens.length===2));
await p.evaluate(()=>{
    const next={...sentMatches.at(-1),uid:33,hash:'Sent-33',messageId:'<sent-three@example.test>',
        inReplyTo:receivedRaw.messageId,dateTimestamp:1789000400,plain:'Nouvelle réponse envoyée'};
    sentMatches.push(next);
    dispatchEvent(new CustomEvent('pw-message-sent',{detail:{account:threadAccount,folder:'INBOX',uid:11,flag:'\\answered'}}));
});
await p.waitForFunction(()=>readerVM.message()?.uid===33);
check('An explicitly sent reply still opens the native Sent copy and reflects the reply flag',await p.evaluate(()=>
    document.querySelector('#messageItem > .bodyText').textContent==='Nouvelle réponse envoyée'
    &&listVM.messageList()[0].flags().includes('\\answered')
    &&document.querySelector('.pw-conversation-history').hidden));
await p.evaluate(()=>{document.documentElement.classList.remove('pw-theme');});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-full').hidden);
check('Switching away from Pied Web restores the native reader and hides the conversation controls',await p.evaluate(()=>
    document.querySelector('.pw-conversation-history').hidden&&!document.querySelector('.b-message').classList.contains('pw-conversation-active')));
await p.evaluate(()=>{document.documentElement.classList.add('pw-theme');});
await waitForCount(5);

await p.evaluate(()=>{
    window.openFixtureMessage=(raw,search='')=>{
        listVM.messageList().folder=raw.folder;listVM.messageList().search=search;
        readerVM.message(NativeDraftCollection.reviveFromJson([raw])[0]);
        document.querySelector('.messageView').scrollTop=0;
        document.querySelector('#messageItem > .bodyText').textContent=raw.plain;
    };
    window.filedRaw={...sourceRaw,folder:'Projects',uid:80,hash:'Projects-80',messageId:'<filed@example.test>',
        references:sourceRaw.messageId,inReplyTo:sourceRaw.messageId,subject:'Message classé',
        dateTimestamp:1789000150,plain:'Message actif classé'};
    sentMatches[0].plain='Aperçu long. '+('Une phrase fictive pour ouvrir la suite du message. '.repeat(8));
    threadRows=()=>[sourceRaw,receivedRaw,...sentMatches,filedRaw];
    failThreadSearch=true;openFixtureMessage(filedRaw);
});
await waitForCount('!');
await openHistory(0);
check('A failed lookup leaves the selected message readable and explains how to retry',await p.evaluate(()=>
    document.querySelector('.pw-conversation-history [role="status"]').textContent==='Conversation incomplète.'
    &&!document.querySelector('.pw-conversation-retry').hidden
    &&document.querySelector('#messageItem > .bodyText').textContent==='Message actif classé'));
await p.evaluate(()=>{failThreadSearch=false;});
await history.getByRole('button',{name:'Réessayer'}).click();
await waitForCount(6);
check('Retry restores the history and keeps the filed message selected',await p.evaluate(()=>
    document.querySelectorAll('.pw-conversation-card').length===5 && readerVM.message().uid===80
    &&threadRequests.at(-1).scope==='account'&&document.querySelector('.pw-conversation-scope').textContent.includes('hors brouillons')));
const accountRequests=await p.evaluate(()=>threadRequests.length);
await p.evaluate(()=>{readerPoll();readerPoll();});
check('Account-wide history is refreshed only when requested',await p.evaluate(before=>threadRequests.length===before,accountRequests));
await history.getByRole('button',{name:'Afficher la suite'}).first().click();
await p.waitForFunction(()=>document.querySelector('.pw-conversation-preview:not([hidden])'));
await p.evaluate(()=>{
    window.stableCards=[...document.querySelectorAll('.pw-conversation-card')];
    window.stableFocus=document.activeElement;
    readerVM.messageLoadingThrottle(true);readerVM.messageLoadingThrottle(false);
});
await p.waitForTimeout(85);
check('A native loading update preserves the expanded preview, card nodes and focus',await p.evaluate(()=>
    stableCards.every((node,index)=>node===document.querySelectorAll('.pw-conversation-card')[index])
    &&document.activeElement===stableFocus&&document.querySelector('.pw-conversation-preview:not([hidden])').textContent.length>180
    &&readerVM.message()?.uid===80));

await p.setViewportSize({width:390,height:850});
await p.evaluate(()=>{
    document.getElementById('V-MailMessageView').hidden=false;
    document.getElementById('rl-right').classList.add('message-selected');
    document.getElementById('V-MailMessageList').hidden=true;
    document.getElementById('rl-left').hidden=true;
});
check('The open history fits a phone viewport',await p.evaluate(()=>{
    const cards=[...document.querySelectorAll('.pw-conversation-card')];
    return cards.length===5 && cards.every(card=>{
        const box=card.getBoundingClientRect();return box.width>0&&box.height>0&&box.left>=0&&box.right<=innerWidth;
    })&&document.documentElement.scrollWidth<=innerWidth;
}));
await p.waitForFunction(()=>document.querySelector('.pw-copy-md')?.closest('menu'));
check('The mobile Back and More controls remain available',await p.evaluate(()=>{
    const back=document.querySelector('#rl-right > .pw-mobile-header > button[data-pw-icon="previous"]');
    return !!back && getComputedStyle(back).display!=='none' && !!document.querySelector('.pw-copy-md')?.closest('.pw-reader-menu menu');
}));
await history.getByRole('button',{name:'Revenir au message seul'}).click();
await p.waitForFunction(()=>document.querySelector('.pw-conversation-history').hidden);
check('The single-message option restores focus to the full-exchange action',await p.evaluate(()=>
    readerVM.message()?.uid===80&&document.activeElement===document.querySelector('.pw-conversation-full')
    &&document.querySelector('.pw-conversation-full').textContent.includes('complet')));
const singleRequests=await p.evaluate(()=>threadRequests.length);
await p.evaluate(()=>{readerVM.messageLoadingThrottle(true);readerVM.messageLoadingThrottle(false);});
await p.waitForTimeout(90);
check('The single-message choice survives native loading notifications',await p.evaluate(before=>
    document.querySelector('.pw-conversation-history').hidden&&threadRequests.length===before,singleRequests));
await control.click();
await waitForCount(6);
check('The full-exchange action can reopen the previously opted-out message',await p.evaluate(()=>
    !document.querySelector('.pw-conversation-history').hidden&&readerVM.message()?.uid===80));

await p.setViewportSize({width:1280,height:620});
await p.evaluate(()=>{
    const body=document.querySelector('#messageItem > .bodyText');
    body.replaceChildren();
    const delayed=document.createElement('div');delayed.id='fixture-delayed-image';body.append(delayed);
    for(let i=0;i<40;i++){
        const paragraph=document.createElement('p');paragraph.id='fixture-line-'+i;
        paragraph.textContent='Fictional body paragraph '+i;paragraph.style.margin='0 0 16px';body.append(paragraph);
    }
    const box=document.querySelector('.messageView');
    box.scrollTop+=document.getElementById('fixture-line-12').getBoundingClientRect().top-box.getBoundingClientRect().top;
    box.dispatchEvent(new Event('scroll'));
});
const bodyTop=await p.evaluate(()=>document.getElementById('fixture-line-12').getBoundingClientRect().top);
await p.evaluate(()=>{document.getElementById('fixture-delayed-image').style.height='180px';});
await p.waitForFunction(top=>Math.abs(document.getElementById('fixture-line-12').getBoundingClientRect().top-top)<2,bodyTop);
check('The reader still anchors a body paragraph when an image above it gains height',true);

await p.evaluate(()=>{
    rl.app.folderList([
        {fullName:'INBOX'}, {fullName:'Sent'}, {fullName:'Archive'},
        {fullName:'Projects',subFolders:[{fullName:'Projects/Team'}]},
        {fullName:'Quarantaine',role:'junk',subFolders:[{fullName:'Quarantaine/Child'}]},
        {fullName:'Corbeille locale',role:'trash'}, {fullName:'Brouillons locaux',role:'drafts'},
        {fullName:'INBOX.Scheduled',subFolders:[{fullName:'INBOX.Scheduled/Child'}]},
        {fullName:'INBOX.Reminders',subFolders:[{fullName:'INBOX.Reminders/Child'}]}
    ]);
});
const protectedRequests=await p.evaluate(()=>threadRequests.filter(request=>request.action==='PiedWebConversation').length);
for(const [index,folder] of ['Drafts','Junk','Trash','Quarantaine','Quarantaine/Child','Corbeille locale',
    'Brouillons locaux','INBOX.Scheduled/Child','INBOX.Reminders/Child','INBOX.Scheduled','INBOX.Reminders'].entries()){
    await p.evaluate(({index,folder})=>openFixtureMessage({...filedRaw,folder,uid:90+index,
        messageId:'<excluded-'+index+'@example.test>',references:'',inReplyTo:''}),{index,folder});
    await p.waitForTimeout(35);
}
check('Protected folders, descendants and queues skip automatic lookup',await p.evaluate(before=>
    threadRequests.filter(request=>request.action==='PiedWebConversation').length===before
    &&document.querySelector('.pw-conversation-history').hidden,protectedRequests));
await control.click();
await waitForCount(1);
check('A protected message permits an explicit full exchange with an informative empty state',await p.evaluate(()=>
    readerVM.message()?.folder==='INBOX.Reminders' && !document.querySelector('.pw-conversation-history').hidden
    &&threadRequests.at(-1).scope==='account' && document.querySelector('.pw-conversation-history [role="status"]').textContent.includes('Aucun autre')));
await history.getByRole('button',{name:'Revenir au message seul'}).click();

await p.evaluate(()=>{
    window.readerCases=['Sent','Archive','Projects','Projects/Team','INBOX'].map((folder,index)=>({...filedRaw,
        folder,uid:110+index,messageId:'<selected-'+index+'@example.test>',
        dateTimestamp:1789000520+index,plain:'Selected fictional '+folder}));
    threadRows=()=>[sourceRaw,receivedRaw,...sentMatches,filedRaw,...readerCases];
});
for(let index=0;index<5;index++){
    const requests=await p.evaluate(()=>threadRequests.length);
    await p.evaluate(index=>openFixtureMessage(readerCases[index],index===4?'subject:fixture':''),index);
    await p.waitForFunction(before=>threadRequests.length>before,requests);
    await waitForCount(11);
    check(['Sent','Archive','Filed folder','Nested folder','Inbox search'][index]+' discovers its account exchange and keeps selection',
        await p.evaluate(index=>readerVM.message()?.uid===110+index&&document.querySelector('#messageItem > .bodyText').textContent===readerCases[index].plain
        &&document.querySelector('.pw-conversation-history').hidden&&threadRequests.at(-1).scope==='account',index));
}
await p.evaluate(()=>{
    sessionStorage.setItem('pw-mail-feed-return',JSON.stringify({search:'subject:fixture',accountHash:threadAccount,
        key:[threadAccount,'INBOX',77,sourceRaw.uid].join('\x1f'),mode:'global'}));
    openFixtureMessage(sourceRaw);
});
await waitForCount(11);
check('A workspace search preserves its account-wide scope for an Inbox result',await p.evaluate(()=>
    readerVM.message()?.uid===11&&threadRequests.at(-1).scope==='account'));
await p.evaluate(()=>{
    sessionStorage.removeItem('pw-mail-feed-return');
    holdThreadSearch=true;window.releaseThreadSearch=null;
    openFixtureMessage({...sourceRaw,uid:71});
});
await p.waitForFunction(()=>!!window.releaseThreadSearch);
await p.evaluate(()=>{
    threadAccount='fixture-B';holdThreadSearch=false;
    openFixtureMessage({...sourceRaw,messageId:'<other@example.test>',references:'',inReplyTo:''});
    releaseThreadSearch();
});
await waitForCount(1);
check('Results from the previous account cannot repopulate the current history',await p.evaluate(()=>
    !document.querySelector('.pw-conversation-card')&&threadRequests.at(-1).account==='fixture-B'));
await p.evaluate(()=>{
    window.partialThreadSearch=true;
    openFixtureMessage({...sourceRaw,uid:72});
});
await waitForCount('!');
await openHistory(0);
check('A partial Inbox lookup states the limitation and exposes refresh',await p.evaluate(()=>
    document.querySelector('.pw-conversation-history [role="status"]').textContent.includes('Échange partiel')
    &&!document.querySelector('.pw-conversation-retry').hidden));
console.log(JSON.stringify({passed:checks.length}));
