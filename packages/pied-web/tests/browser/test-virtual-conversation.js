const fixtureBase=globalThis.PW_FIXTURE_URL||'http://127.0.0.1:8876';
const p=await browser.getPage('nextsnapmail-reader-conversation');p.setDefaultTimeout(7000);
let previewNetworkRequests=0;
await p.route('https://tracker.example.test/**',route=>{++previewNetworkRequests;return route.abort();});
await p.setViewportSize({width:1280,height:900});
await p.goto(fixtureBase+'/.local-work/images-native-preview.html?drafts=1&mode=reader&side=1');
await p.waitForFunction(()=>window.draftsReady);
await p.evaluate(()=>{
    document.documentElement.classList.add('pw-theme');
    const get=rl.settings.get;
    window.threadAccount='fixture-A';window.conversations=true;
    rl.settings.get=k=>k==='SentFolder'?'Sent':k==='accountHash'?threadAccount
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
    window.threadRequests=[];window.nativeOpens=[];window.failThreadSearch=false;window.holdThreadSearch=false;
    listVM.selector={oCallbacks:{ItemSelect(model){
        nativeOpens.push({folder:model.folder,uid:model.uid});readerVM.message(model);
        const all=[sourceRaw,receivedRaw,...sentMatches];
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
});
await p.addScriptTag({url:fixtureBase+'/.local-work/pied-web-ux/conversation-thread.js'});
await p.waitForFunction(()=>readerVM.pwConversationThread===true);
await p.waitForFunction(()=>readerVM.message()?.folder==='Sent'&&readerVM.message()?.uid===32
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===3);
await p.waitForFunction(()=>!document.querySelector('.b-message').classList.contains('pw-conversation-pending'));
const checks=[];const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
check('The newest Sent message opens in the native reader while three older messages stay one click away',await p.evaluate(()=>
    readerVM.message().folder==='Sent'&&readerVM.message().uid===32
    &&document.querySelector('#messageItem > .bodyText').textContent==='Dernière réponse envoyée'
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===3
    &&document.querySelectorAll('.pw-conversation-after .pw-conversation-card').length===0));
check('The conversation heading uses the earliest message subject, and the open subject matches the sender line size',await p.evaluate(()=>{
    const heading=document.querySelector('.pw-conversation-before h2');
    const subject=document.querySelector('.b-message > .messageItemHeader .subjectParent > .subject');
    const sender=document.querySelector('.pw-sender-name');
    return heading.textContent==='Projet Alpha'&&!heading.hidden&&subject&&sender
        &&getComputedStyle(subject).fontSize===getComputedStyle(sender).fontSize;
}));
check('A reader built before the plugin script is mounted from its native Knockout view model',await p.evaluate(()=>
    readerVM.pwConversationThread===true&&!!document.querySelector('.pw-conversation-before')));
check('A folded message has one border, and native Close sits beside the toolbar arrows',await p.evaluate(()=>{
    const card=document.querySelector('.pw-conversation-card'),button=card.querySelector('button');
    const close=document.querySelector('#V-MailMessageView .top-toolbar .buttonClose');
    const next=document.querySelector('#V-MailMessageView .top-toolbar .buttonDown');
    const subjectClose=document.querySelector('.b-message > .messageItemHeader .subjectParent > .close');
    return getComputedStyle(card).borderTopWidth!=='0px'
        &&getComputedStyle(button).borderTopWidth==='0px'
        &&getComputedStyle(close).display!=='none'
        &&close.getBoundingClientRect().left-next.getBoundingClientRect().right<=12
        &&close.getBoundingClientRect().left>=next.getBoundingClientRect().right
        &&getComputedStyle(subjectClose).display==='none';
}));
check('The stack includes both received messages and historical Sent replies without making copies',await p.evaluate(()=>
    threadRequests.every(request=>['PiedWebConversation','Message'].includes(request.action))
    &&threadRequests.filter(request=>request.action==='PiedWebConversation').length===1
    &&threadRequests[0].action==='PiedWebConversation'&&threadRequests[0].folder==='INBOX'
    &&nativeOpens.length===1));
await p.waitForFunction(()=>[...document.querySelectorAll('.pw-conversation-card-summary')].some(node=>node.textContent==='Première réponse envoyée'));
check('Folded cards show one-line plain-text body previews, never the repeated subject or active HTML',await p.evaluate(()=>
    !document.querySelector('.pw-conversation-card img, .pw-conversation-card script')
    &&[...document.querySelectorAll('.pw-conversation-card-summary')].some(node=>node.textContent==='Première réponse envoyée')
    &&[...document.querySelectorAll('.pw-conversation-card-summary')].every(node=>!node.textContent.includes('Projet Alpha'))
    &&getComputedStyle(document.querySelector('.pw-conversation-card-summary')).whiteSpace==='nowrap'));
check('Inert preview extraction does not fetch remote tracking images',previewNetworkRequests===0);
await p.locator('.pw-conversation-card-toggle').nth(2).click();
await p.waitForFunction(()=>readerVM.message()?.folder==='INBOX'&&readerVM.message()?.uid===12
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===2
    &&document.querySelectorAll('.pw-conversation-after .pw-conversation-card').length===1);
check('An older received message opens with its native body and actions',await p.evaluate(()=>
    document.querySelector('#messageItem > .bodyText').textContent==='Réponse reçue'
    &&document.querySelector('.pw-conversation-before h2').textContent==='Projet Alpha'
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===2
    &&document.querySelectorAll('.pw-conversation-after .pw-conversation-card').length===1));
await p.locator('.pw-conversation-before > button').first().click();
await p.waitForFunction(()=>readerVM.message()?.folder==='Sent'&&readerVM.message()?.uid===32);
check('The last message is one click away from an earlier message',await p.evaluate(()=>
    nativeOpens.at(-1).folder==='Sent'&&nativeOpens.at(-1).uid===32));
await p.evaluate(()=>{
    thirdReceived={...receivedRaw,uid:13,hash:'INBOX-13',messageId:'<received-three@example.test>',
        dateTimestamp:1789000400,plain:'Dernier message reçu'};
    listVM.messageList()[0].threads([11,12,13]);
    const model=NativeDraftCollection.reviveFromJson([thirdReceived])[0];model.threads([11,12,13]);
    readerVM.message(model);
    document.querySelector('#messageItem > .bodyText').textContent='Dernier message reçu';
});
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===4
    &&readerVM.message()?.uid===13);
check('When the latest message is received it stays expanded, with older Sent and received messages folded',await p.evaluate(()=>
    readerVM.message().folder==='INBOX'&&readerVM.message().uid===13
    &&document.querySelector('.pw-conversation-before h2').textContent==='Projet Alpha'
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===4
    &&document.querySelectorAll('.pw-conversation-after .pw-conversation-card').length===0));
await p.setViewportSize({width:1280,height:420});
await p.locator('.pw-conversation-card-toggle').first().click();
await p.waitForFunction(()=>readerVM.message()?.uid===11
    &&!document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length
    &&document.querySelectorAll('.pw-conversation-after .pw-conversation-card').length===4);
check('The oldest message keeps the conversation heading and the latest-message action in view',await p.evaluate(()=>
    document.querySelector('.messageView').scrollTop===0
    &&!document.querySelector('.pw-conversation-before > button').hidden));
await p.locator('.pw-conversation-before > button').first().click();
await p.waitForFunction(()=>readerVM.message()?.uid===13
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===4);
check('A message opened under a long folded history starts in the viewport',await p.evaluate(()=>{
    const box=document.querySelector('.messageView').getBoundingClientRect();
    const head=document.querySelector('.b-message > .messageItemHeader').getBoundingClientRect();
    const last=[...document.querySelectorAll('.pw-conversation-before .pw-conversation-card')].at(-1);
    return document.querySelector('.messageView').scrollTop>0
        &&head.top-box.top>=80&&head.top-box.top<=140&&head.bottom<=box.bottom
        &&last.querySelector('strong').getBoundingClientRect().top>=box.top
        &&last.querySelector('time').getBoundingClientRect().bottom<=box.bottom;
}));
await p.evaluate(()=>{
    document.querySelector('.messageView').scrollTop=0;
    readerVM.messageLoadingThrottle(true);readerVM.messageLoadingThrottle(false);
});
await p.waitForTimeout(400);
check('A later settle leaves a manual scroll alone',await p.evaluate(()=>
    document.querySelector('.messageView').scrollTop===0
    &&!document.querySelector('.b-message').classList.contains('pw-conversation-pending')));
await p.evaluate(()=>{
    sentMatches.push({...sentMatches.at(-1),uid:33,hash:'Sent-33',messageId:'<sent-three@example.test>',
        inReplyTo:'<received-three@example.test>',
        references:'<root@example.test> <received-three@example.test>',
        dateTimestamp:1789000500,plain:'Nouvelle réponse envoyée'});
    dispatchEvent(new CustomEvent('pw-message-sent',{detail:{
        account:threadAccount,folder:'INBOX',uid:13,flag:'\\answered'
    }}));
});
await p.waitForFunction(()=>readerVM.message()?.folder==='Sent'&&readerVM.message()?.uid===33
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===5
    &&!document.querySelector('.b-message').classList.contains('pw-conversation-pending'));
check('A successful reply refreshes the open stack immediately, marks its feed row and scrolls to the sent message',await p.evaluate(()=>{
    const box=document.querySelector('.messageView').getBoundingClientRect();
    const head=document.querySelector('.b-message > .messageItemHeader').getBoundingClientRect();
    return document.querySelector('#messageItem > .bodyText').textContent==='Nouvelle réponse envoyée'
        &&listVM.messageList()[0].flags().includes('\\answered')
        &&document.querySelector('.messageView').scrollTop>0
        &&head.top-box.top>=80&&head.top-box.top<=140&&head.bottom<=box.bottom;
}));
await p.setViewportSize({width:390,height:850});
await p.evaluate(()=>{
    document.getElementById('V-MailMessageView').hidden=false;
    document.getElementById('rl-right').classList.add('message-selected');
    document.getElementById('V-MailMessageList').hidden=true;
    document.getElementById('rl-left').hidden=true;
});
check('The visible conversation stack fits a narrow screen',await p.evaluate(()=>{
    const cards=[...document.querySelectorAll('.pw-conversation-card')];
    return cards.length===5&&cards.every(card=>{
        const box=card.getBoundingClientRect();return box.width>0&&box.height>0&&box.left>=0&&box.right<=innerWidth;
    })&&document.documentElement.scrollWidth<=innerWidth;
}));
check('On mobile, the header Back action closes the reader without hiding other toolbar commands',await p.evaluate(()=>{
    const back=document.querySelector('#rl-right > .pw-mobile-header > button[data-pw-icon="previous"]');
    const copy=document.querySelector('#V-MailMessageView .pw-copy-md-group');
    return back && getComputedStyle(back).display!=='none' && copy && getComputedStyle(copy).display!=='none';
}));
await p.evaluate(()=>{document.documentElement.classList.remove('pw-theme');});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-before').hidden);
check('Leaving the theme restores the single native reader',await p.evaluate(()=>
    document.querySelector('.pw-conversation-before').hidden&&document.querySelector('.pw-conversation-after').hidden
    &&!document.querySelector('.b-message').classList.contains('pw-conversation-active')));
await p.evaluate(()=>{document.documentElement.classList.add('pw-theme');});
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-card').length===5);
await p.evaluate(()=>{conversations=false;readerVM.message(NativeDraftCollection.reviveFromJson([sourceRaw])[0]);});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-before').hidden);
check('Individual-message mode does not show the conversation stack',true);
await p.evaluate(()=>{conversations=true;failThreadSearch=true;readerVM.message(NativeDraftCollection.reviveFromJson([receivedRaw])[0]);});
await p.waitForFunction(()=>!document.querySelector('.pw-conversation-retry').hidden);
check('A failed search offers a retry without changing mailbox data',await p.evaluate(()=>
    document.querySelector('.pw-conversation-retry')?.textContent==='Réessayer'));
await p.evaluate(()=>{failThreadSearch=false;});
await p.locator('.pw-conversation-retry').click();
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-card').length===5
    &&readerVM.message()?.folder==='Sent'&&readerVM.message()?.uid===33);
check('Retry restores the stack',true);
await p.evaluate(()=>{holdThreadSearch=true;readerVM.message(NativeDraftCollection.reviveFromJson([{...sourceRaw,uid:14,hash:'INBOX-14'}])[0]);});
await p.waitForFunction(()=>!!window.releaseThreadSearch);
await p.evaluate(()=>{threadAccount='fixture-B';holdThreadSearch=false;readerVM.message(NativeDraftCollection.reviveFromJson([{
    ...sourceRaw,uid:91,hash:'INBOX-91',messageId:'<other@example.test>',subject:'Autre conversation',references:'',inReplyTo:''
}])[0]);releaseThreadSearch();});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-before').hidden);
check('Results from a previous account do not reappear',await p.evaluate(()=>
    document.querySelector('.pw-conversation-before').hidden&&threadRequests.at(-1).account==='fixture-B'));
await p.evaluate(()=>{
    threadAccount='fixture-C';thirdReceived=null;
    sourceRaw={...sourceRaw,uid:50,hash:'INBOX-50',messageId:'<single@example.test>',
        references:'',inReplyTo:'',subject:'Un seul message reçu',dateTimestamp:1789000500,plain:'Message reçu seul'};
    sentMatches=[{...sentMatches[0],uid:51,hash:'Sent-51',messageId:'<single-sent@example.test>',
        inReplyTo:'<single@example.test>',references:'<single@example.test>',
        subject:'Re: Un seul message reçu',dateTimestamp:1789000600,plain:'Réponse envoyée seule'}];
    readerVM.message(NativeDraftCollection.reviveFromJson([sourceRaw])[0]);
});
await p.waitForFunction(()=>readerVM.message()?.folder==='Sent'&&readerVM.message()?.uid===51
    &&document.querySelectorAll('.pw-conversation-before .pw-conversation-card').length===1);
check('A single received message and its older Sent reply also form a native two-message stack',await p.evaluate(()=>
    document.querySelector('#messageItem > .bodyText').textContent==='Réponse envoyée seule'
    &&document.querySelector('.pw-conversation-before h2').textContent==='Un seul message reçu'
    &&threadRequests.at(-1).account==='fixture-C'));
await p.evaluate(()=>{
    holdThreadSearch=true;releaseThreadSearch=null;
    readerVM.message(NativeDraftCollection.reviveFromJson([{
        ...sourceRaw,uid:60,hash:'INBOX-60',dateTimestamp:1789000550
    }])[0]);
});
await p.waitForFunction(()=>!!window.releaseThreadSearch);
check('The old native reader is concealed while a new conversation lookup is pending',await p.evaluate(()=>
    document.querySelector('.b-message').classList.contains('pw-conversation-pending')
    &&document.querySelector('.pw-conversation-before h2').hidden
    &&getComputedStyle(document.querySelector('.b-message > .messageItemHeader')).display==='none'
    &&getComputedStyle(document.querySelector('#messageItem')).display==='none'
    &&document.querySelector('.pw-conversation-before > [role="status"]').textContent.includes('Recherche')));
await p.evaluate(()=>{
    document.querySelector('.messageView').dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-100}));
    document.querySelector('.messageView').scrollTop=0;
    holdThreadSearch=false;releaseThreadSearch();
});
await p.waitForFunction(()=>!document.querySelector('.b-message').classList.contains('pw-conversation-pending'));
check('The native reader reappears after the conversation lookup',await p.evaluate(()=>
    getComputedStyle(document.querySelector('#messageItem')).display!=='none'));
check('Manual scroll during lookup survives automatic opening of the latest message',await p.evaluate(()=>
    document.querySelector('.messageView').scrollTop===0&&readerVM.message()?.uid===51));
const requestsBeforeTrash=await p.evaluate(()=>threadRequests.filter(request=>request.action==='PiedWebConversation').length);
await p.evaluate(()=>{
    const trash={...sourceRaw,folder:'Trash',uid:70,hash:'Trash-70',messageId:'<trash@example.test>',
        references:'',inReplyTo:'',subject:'Message supprimé',dateTimestamp:1789000800,plain:'Dans la corbeille'};
    readerVM.message(NativeDraftCollection.reviveFromJson([trash])[0]);
});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-before').hidden
    &&!document.querySelector('.b-message').classList.contains('pw-conversation-active'));
await p.waitForTimeout(250);
check('A message opened from Trash stays in the single native reader with no conversation lookup',await p.evaluate(before=>
    threadRequests.filter(request=>request.action==='PiedWebConversation').length===before
    &&document.querySelector('.pw-conversation-before').hidden
    &&document.querySelector('.pw-conversation-after').hidden,requestsBeforeTrash));

await p.setViewportSize({width:1280,height:620});
await p.evaluate(()=>{
    filedRaw={...sourceRaw,folder:'Projects',uid:80,hash:'Projects-80',messageId:'<filed@example.test>',
        references:'<single@example.test>',inReplyTo:'<single@example.test>',subject:'Message classé',
        dateTimestamp:1789000700,plain:'Message actif classé'};
    threadRows=()=>[sourceRaw,...sentMatches,filedRaw];
    readerVM.message(NativeDraftCollection.reviveFromJson([filedRaw])[0]);
    document.querySelector('#messageItem > .bodyText').textContent=filedRaw.plain;
});
await p.waitForFunction(()=>!document.querySelector('.pw-conversation-full').hidden);
check('A filed message offers an explicit full-exchange action, without an automatic lookup',await p.evaluate(before=>
    threadRequests.filter(request=>request.action==='PiedWebConversation').length===before
    &&document.querySelector('.pw-conversation-before').hidden,requestsBeforeTrash));
await p.locator('.pw-conversation-full').click();
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-card').length===2
    &&!document.querySelector('.b-message').classList.contains('pw-conversation-pending'));
check('Explicit full exchange keeps the filed message as the only native action target',await p.evaluate(()=>
    threadRequests.filter(request=>request.action==='PiedWebConversation').at(-1).scope==='account'
    &&readerVM.message().folder==='Projects'&&readerVM.message().uid===80
    &&document.querySelector('#messageItem > .bodyText').textContent==='Message actif classé'
    &&!document.querySelector('.pw-conversation-current').hidden
    &&document.querySelector('.pw-conversation-scope').textContent.includes('hors brouillons')));
await p.locator('.pw-conversation-preview-toggle').last().click();
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-preview:not([hidden])').length===1);
check('A previous-message preview expands separately without changing reader selection or reading flags',await p.evaluate(()=>
    readerVM.message().folder==='Projects'&&readerVM.message().uid===80
    &&document.querySelectorAll('.pw-conversation-preview[hidden]').length===1
    &&[...document.querySelectorAll('.pw-conversation-preview')].some(node=>!node.hidden&&node.textContent==='Réponse envoyée seule')
    &&threadRequests.every(request=>['PiedWebConversation','Message'].includes(request.action))));
await p.evaluate(()=>{
    stableCards=[...document.querySelectorAll('.pw-conversation-card')];
    document.querySelector('.pw-conversation-preview-toggle').focus();
    stableFocus=document.activeElement;
    readerVM.messageLoadingThrottle(true);readerVM.messageLoadingThrottle(false);
});
await p.waitForTimeout(250);
check('Refresh preserves keyed card identity, keyboard focus and explicit preview state',await p.evaluate(()=>
    stableCards.every((node,index)=>node===document.querySelectorAll('.pw-conversation-card')[index])
    &&document.activeElement===stableFocus
    &&document.querySelectorAll('.pw-conversation-preview:not([hidden])').length===1));
await p.locator('.pw-conversation-preview-toggle').last().click();
await p.evaluate(()=>{
    const box=document.querySelector('.messageView'),head=document.querySelector('.b-message > .messageItemHeader');
    box.scrollTop+=head.getBoundingClientRect().top-box.getBoundingClientRect().top-100;
    box.dispatchEvent(new Event('scroll'));
});
const headerBeforeResize=await p.evaluate(()=>document.querySelector('.b-message > .messageItemHeader').getBoundingClientRect().top);
await p.evaluate(()=>{document.querySelector('.pw-conversation-card').style.paddingTop='96px';});
await p.waitForFunction(top=>Math.abs(document.querySelector('.b-message > .messageItemHeader').getBoundingClientRect().top-top)<2,headerBeforeResize);
check('Late layout above the visible message preserves its viewport position',await p.evaluate(top=>
    Math.abs(document.querySelector('.b-message > .messageItemHeader').getBoundingClientRect().top-top)<2,headerBeforeResize));
await p.evaluate(()=>{
    const body=document.querySelector('#messageItem > .bodyText');body.replaceChildren();
    const delayed=document.createElement('div');delayed.id='fictional-delayed-image';body.append(delayed);
    for(let i=0;i<40;i++){
        const paragraph=document.createElement('p');paragraph.id='fictional-line-'+i;
        paragraph.textContent='Fictional body paragraph '+i;paragraph.style.margin='0 0 16px';body.append(paragraph);
    }
    const box=document.querySelector('.messageView');
    box.scrollTop+=document.getElementById('fictional-line-12').getBoundingClientRect().top-box.getBoundingClientRect().top;
    box.dispatchEvent(new Event('scroll'));
});
const bodyLineBefore=await p.evaluate(()=>document.getElementById('fictional-line-12').getBoundingClientRect().top);
await p.evaluate(()=>{document.getElementById('fictional-delayed-image').style.height='180px';});
await p.waitForFunction(top=>Math.abs(document.getElementById('fictional-line-12').getBoundingClientRect().top-top)<2,bodyLineBefore);
check('Late image-sized content preserves the body paragraph being read',true);
await p.locator('.pw-conversation-before > button').filter({hasText:'Revenir au message seul'}).click();
await p.waitForFunction(()=>document.querySelector('.pw-conversation-before').hidden);
check('Leaving explicit exchange restores the same individual filed message',await p.evaluate(()=>
    readerVM.message().folder==='Projects'&&readerVM.message().uid===80
    &&!document.querySelector('.pw-conversation-full').hidden));
console.log(JSON.stringify({passed:checks.length}));
