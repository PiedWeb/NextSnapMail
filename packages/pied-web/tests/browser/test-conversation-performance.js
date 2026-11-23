/* The selected message must be readable even while a large exchange is pending. */
const fixtureBase=globalThis.PW_FIXTURE_URL||'http://127.0.0.1:8876';
const p=await browser.getPage('agent-conversation-performance');p.setDefaultTimeout(7000);
const results=[];
for(const scenario of [{width:1280,height:900,count:200},{width:390,height:850,count:3},
    {width:390,height:850,count:3,error:true},{width:390,height:850,count:3,openDuringLookup:true}]){
    await p.setViewportSize({width:scenario.width,height:scenario.height});
    await p.goto(fixtureBase+'/.local-work/images-native-preview.html?drafts=1&mode=reader&side=1');
    await p.bringToFront();
    await p.waitForFunction(()=>window.draftsReady);
    await p.evaluate(({count,error})=>{
        document.documentElement.classList.add('pw-theme');
        const get=rl.settings.get;
        rl.settings.get=k=>k==='SentFolder'?'Sent':k==='accountHash'?'stress-fixture'
            :k==='useThreads'?true:k==='threadAlgorithm'?'REFERENCES':get(k);
        const email={'@Object':'Object/Email',name:'Fictional sender',email:'sender@example.test'};
        window.stressRows=Array.from({length:count},(_,i)=>({'@Object':'Object/Message',folder:i%2?'Sent':'INBOX',uid:i+1,
            hash:'fixture-'+i,flags:['\\seen'],messageId:'<fixture-'+i+'@example.test>',inReplyTo:'<fixture-0@example.test>',
            references:i?'<fixture-0@example.test>':'',subject:'Performance fixture',dateTimestamp:1789000000+i,
            plain:'Fictional plain-text message '+i,html:'',from:[email],to:[email],replyTo:[],cc:[],bcc:[],headers:[],attachments:[]}));
        const collection=NativeDraftCollection.reviveFromJson([stressRows[0]]);collection.folder='INBOX';
        collection[0].threads(stressRows.filter(r=>r.folder==='INBOX').map(r=>r.uid));
        listVM.messageList(collection);readerVM.message(collection[0]);readerVM.messageLoadingThrottle=ko.observable(false);
        document.querySelector('#messageItem > .bodyText').textContent='Selected fictional message';
        if(innerWidth<800){
            document.getElementById('V-MailMessageView').hidden=false;
            document.getElementById('rl-right').classList.add('message-selected');
            document.getElementById('V-MailMessageList').hidden=true;
            document.getElementById('rl-left').hidden=true;
        }
        window.stress={requests:0,messageReads:0,nativeOpens:0,mutations:0,shifts:[]};
        listVM.selector={oCallbacks:{ItemSelect(model){
            ++stress.nativeOpens;stress.opened=performance.now();readerVM.message(model);
            document.querySelector('#messageItem > .bodyText').textContent='Active fictional message';
        }}};
        const other=rl.pluginRemoteRequest;
        rl.pluginRemoteRequest=(cb,action,params)=>{
            if(action!=='PiedWebConversation')return other(cb,action,params);
            ++stress.requests;
            stress.finishLookup=()=>cb(0,{Result:error?{error:'fixture'}:{etag:'stress',messages:stressRows,unchanged:false}});
        };
        rl.app.Remote.post=async()=>{++stress.messageReads;return {Result:{plain:'Fictional preview'}};};
        ko.applyBindingAccessorsToNode(document.getElementById('V-MailMessageList'),{css:()=>({})},listVM);
        ko.applyBindingAccessorsToNode(document.getElementById('V-MailMessageView'),{css:()=>({})},readerVM);
    },scenario);
    await p.addScriptTag({url:fixtureBase+'/.local-work/pied-web-ux/conversation-thread.js'});
    await p.waitForFunction(()=>stress.finishLookup);
    if(scenario.openDuringLookup)await p.locator('.pw-conversation-full').click();
    // The result arrives outside the CLS interaction grace period.
    await p.waitForTimeout(610);
    await p.evaluate(()=>{
        const body=document.querySelector('#messageItem > .bodyText');
        if(!body.getClientRects().length||body.textContent!=='Selected fictional message')
            throw new Error('Reader is hidden while the exchange is pending');
        stress.bodyTop=body.getBoundingClientRect().top;
        stress.shiftObserver=new PerformanceObserver(list=>stress.shifts.push(...list.getEntries()));
        stress.shiftObserver.observe({type:'layout-shift'});
        stress.lookupReleased=performance.now();
        stress.finishLookup();
    });
    await p.waitForFunction(badge=>document.querySelector('.pw-conversation-count')?.textContent===badge,
        scenario.error?'!':String(scenario.count));
    await p.waitForTimeout(100);
    const sample=await p.evaluate(()=>{
        const body=document.querySelector('#messageItem > .bodyText');
        stress.shifts.push(...stress.shiftObserver.takeRecords());
        stress.shiftObserver.disconnect();
        return {visible:!document.hidden,requests:stress.requests,messageReads:stress.messageReads,
            cardsAfterLookup:document.querySelectorAll('.pw-conversation-card').length,
            movementPx:body.getBoundingClientRect().top-stress.bodyTop,
            cls:stress.shifts.filter(entry=>!entry.hadRecentInput).reduce((sum,entry)=>sum+entry.value,0),
            selected:readerVM.message()?.uid===1&&stress.nativeOpens===0};
    });
    const expectedCards=scenario.openDuringLookup?scenario.count-1:0;
    if(!sample.visible||sample.requests!==1||sample.cardsAfterLookup!==expectedCards||sample.messageReads||!sample.selected
        ||Math.abs(sample.movementPx)>1||sample.cls>0.0001)
        throw new Error('Stable reader contract failed '+JSON.stringify(sample));
    if(!scenario.openDuringLookup)await p.locator('.pw-conversation-full').click();
    if(scenario.error){
        await p.waitForFunction(()=>!document.querySelector('.pw-conversation-retry').hidden);
    }else{
        await p.waitForFunction(count=>document.querySelectorAll('.pw-conversation-card').length===count,scenario.count-1);
    }
    sample.openedCards=await p.evaluate(()=>document.querySelectorAll('.pw-conversation-card').length);
    await p.evaluate(()=>{
        stableStressCards=[...document.querySelectorAll('.pw-conversation-card')];
        stressObserver=new MutationObserver(records=>{stress.mutations+=records.filter(r=>r.type==='childList').length;});
        document.querySelectorAll('.pw-conversation-cards').forEach(node=>stressObserver.observe(node,{childList:true}));
        readerVM.messageLoadingThrottle(true);readerVM.messageLoadingThrottle(false);
    });
    await p.waitForTimeout(70);
    sample.stable=await p.evaluate(()=>{
        stressObserver.disconnect();
        return stress.mutations===0&&stableStressCards.every((node,i)=>node===document.querySelectorAll('.pw-conversation-card')[i]);
    });
    if(!sample.stable)throw new Error('History rebuilt stable cards');
    results.push({...scenario,...sample});
}
console.log(JSON.stringify({fixture:'Delayed conversation results with fictional mail',results}));
