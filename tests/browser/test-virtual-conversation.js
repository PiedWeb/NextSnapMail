const fixtureBase=globalThis.PW_FIXTURE_URL||'http://127.0.0.1:8876';
const p=await browser.getPage('nextsnapmail-virtual-conversation');p.setDefaultTimeout(6000);
await p.setViewportSize({width:1280,height:900});
await p.goto(fixtureBase+'/.local-work/images-native-preview.html?drafts=1&mode=list&side=1');
await p.waitForFunction(()=>window.draftsReady);
await p.evaluate(()=>{
    document.documentElement.classList.add('pw-theme');
    const get=rl.settings.get;
    window.threadAccount='fixture-A';
    rl.settings.get=k=>k==='SentFolder'?'Sent':k==='accountHash'?threadAccount:get(k);
    const email=(name,address)=>({'@Object':'Object/Email',name,email:address});
    const raw=(folder,uid,id,parent,refs,subject,date)=>({'@Object':'Object/Message',folder,uid,
        hash:folder+'-'+uid,flags:['\\seen'],messageId:id,inReplyTo:parent,references:refs,
        subject,dateTimestamp:date,to:[email('Camille','camille@example.test')],
        from:[email('Alex','alex@example.test')],replyTo:[],cc:[],bcc:[],headers:[],attachments:[]});
    window.threadSource=[
        raw('INBOX',11,'<root@example.test>','','','Projet Alpha',1789000000),
        raw('INBOX',12,'<incoming@example.test>','<root@example.test>','<root@example.test>','Re: Projet Alpha',1789000200)
    ];
    window.sentMatches=[
        raw('Sent',31,'<sent-one@example.test>','<root@example.test>','<root@example.test>','Re: Projet Alpha',1789000100),
        raw('Sent',32,'<sent-two@example.test>','<sent-one@example.test>','<root@example.test> <sent-one@example.test>','Re: Projet Alpha',1789000300)
    ];
    const collection=NativeDraftCollection.reviveFromJson(threadSource);collection.folder='INBOX';collection.search='';
    listVM.messageList(collection);listVM.messageList.threadUid(11);
    window.openedSent=[];window.threadRequests=[];window.failThreadSearch=false;
    listVM.selector={unselect(){},oCallbacks:{ItemSelect:message=>openedSent.push(message)}};
    rl.app.Remote.post=async(action,trigger,params)=>{
        threadRequests.push({action,folder:params.folder,search:params.search,account:threadAccount});
        const snapshot=structuredClone(sentMatches);
        if(window.holdThreadSearch)await new Promise(resolve=>window.releaseThreadSearch=resolve);
        if(failThreadSearch)throw new Error('fictional network failure');
        const header=new URLSearchParams(params.search).get('header')||'';
        const field=header.split(' ')[0],id=header.slice(field.length+1);
        const found=snapshot.filter(item=>String(item[field==='References'?'references':'inReplyTo']).includes(id));
        return {Result:{'@Object':'Collection/MessageCollection','@Collection':found.slice(params.offset,params.offset+params.limit),folder:{name:params.folder},offset:params.offset,totalEmails:found.length}};
    };
});
await p.addScriptTag({url:fixtureBase+'/.local-work/pied-web-ux/conversation-thread.js'});
await p.evaluate(()=>dispatchEvent(new CustomEvent('rl-view-model',{detail:listVM})));
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-sent-row').length===2);
const checks=[];const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
check('Historical Sent replies appear in the open conversation without mailbox writes',await p.evaluate(()=>
    document.querySelectorAll('.pw-conversation-sent-row').length===2
    &&threadRequests.length===2&&threadRequests.every(request=>request.action==='MessageList'&&request.folder==='Sent')));
check('References and direct-reply searches deduplicate the same Sent UID',await p.evaluate(()=>
    [...document.querySelectorAll('.pw-conversation-sent-row')].map(row=>row.dataset.uid).join(',')==='31,32'
    &&threadRequests.some(request=>new URLSearchParams(request.search).get('header')?.startsWith('In-Reply-To '))));
check('Source-folder UIDs and native selection remain untouched',await p.evaluate(()=>
    listVM.messageList().map(message=>message.uid).join(',')==='11,12'
    &&document.querySelectorAll('.pw-conversation-sent .messageListItem,.pw-conversation-sent .messageCheckbox').length===0));
await p.locator('.pw-conversation-sent-row').first().click();
check('Click passes a native Sent MessageModel to the reader',await p.evaluate(()=>
    openedSent.length===1&&openedSent[0].constructor.name==='MessageModel'
    &&openedSent[0].folder==='Sent'&&openedSent[0].uid===31));
await p.evaluate(()=>{sentMatches[0].subject='<img src=x onerror=alert(1)>';listVM.messageList.valueHasMutated();});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-sent-subject')?.textContent.startsWith('<img'));
check('Untrusted subject stays text',await p.evaluate(()=>!document.querySelector('.pw-conversation-sent img')));
await p.evaluate(()=>{listVM.messageList.threadUid(0);});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-sent').hidden);
check('Sent lookup is confined to an open native thread',await p.evaluate(()=>document.querySelector('.pw-conversation-sent').hidden));
await p.evaluate(()=>{failThreadSearch=true;listVM.messageList.threadUid(11);});
await p.waitForFunction(()=>!document.querySelector('.pw-conversation-sent > button').hidden);
check('Read failure has an explicit retry',await p.evaluate(()=>document.querySelector('.pw-conversation-sent > button').textContent==='Réessayer'));
await p.evaluate(()=>{failThreadSearch=false;});await p.locator('.pw-conversation-sent > button').click();
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-sent-row').length===2);
check('Retry restores the virtual replies',true);
await p.evaluate(()=>{document.documentElement.classList.remove('pw-theme');});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-sent').hidden);
check('Leaving Pied Web hides the extension',true);
await p.evaluate(()=>{document.documentElement.classList.add('pw-theme');});
await p.waitForFunction(()=>document.querySelectorAll('.pw-conversation-sent-row').length===2);
await p.setViewportSize({width:390,height:850});
check('Mobile rows are readable and stay inside the viewport',await p.evaluate(()=>[...document.querySelectorAll('.pw-conversation-sent-row')].every(row=>{
    const box=row.getBoundingClientRect();return box.height>=44&&box.left>=0&&box.right<=innerWidth;
})&&document.documentElement.scrollWidth<=innerWidth));
await p.evaluate(()=>{holdThreadSearch=true;listVM.messageList.valueHasMutated();});
await p.waitForFunction(()=>!!window.releaseThreadSearch);
await p.evaluate(()=>{threadAccount='fixture-B';sentMatches=[];holdThreadSearch=false;listVM.messageList.valueHasMutated();releaseThreadSearch();});
await p.waitForFunction(()=>document.querySelector('.pw-conversation-sent').hidden);
await p.waitForTimeout(400);
check('A delayed result from another account cannot restore old replies',await p.evaluate(()=>
    document.querySelector('.pw-conversation-sent').hidden&&document.querySelectorAll('.pw-conversation-sent-row').length===0
    &&threadRequests.at(-1).account==='fixture-B'));
console.log(JSON.stringify({passed:checks.length}));
