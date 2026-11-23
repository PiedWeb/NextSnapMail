/* The selected message must be readable even while a large exchange is pending. */
const fixtureBase=globalThis.PW_FIXTURE_URL||'http://127.0.0.1:8876';
const p=await browser.getPage('agent-conversation-performance');p.setDefaultTimeout(7000);
await p.setViewportSize({width:1280,height:900});
const results=[];
for(let run=0;run<3;run++){
    await p.goto(fixtureBase+'/.local-work/images-native-preview.html?drafts=1&mode=reader&side=1');
    await p.bringToFront();
    await p.waitForFunction(()=>window.draftsReady);
    await p.evaluate(()=>{
        document.documentElement.classList.add('pw-theme');
        const get=rl.settings.get;
        rl.settings.get=k=>k==='SentFolder'?'Sent':k==='accountHash'?'stress-fixture'
            :k==='useThreads'?true:k==='threadAlgorithm'?'REFERENCES':get(k);
        const email={'@Object':'Object/Email',name:'Fictional sender',email:'sender@example.test'};
        window.stressRows=Array.from({length:200},(_,i)=>({'@Object':'Object/Message',folder:i%2?'Sent':'INBOX',uid:i+1,
            hash:'fixture-'+i,flags:['\\seen'],messageId:'<fixture-'+i+'@example.test>',inReplyTo:'<fixture-0@example.test>',
            references:i?'<fixture-0@example.test>':'',subject:'Performance fixture',dateTimestamp:1789000000+i,
            plain:'Fictional plain-text message '+i,html:'',from:[email],to:[email],replyTo:[],cc:[],bcc:[],headers:[],attachments:[]}));
        const collection=NativeDraftCollection.reviveFromJson([stressRows[0]]);collection.folder='INBOX';
        collection[0].threads(stressRows.filter(r=>r.folder==='INBOX').map(r=>r.uid));
        listVM.messageList(collection);readerVM.message(collection[0]);readerVM.messageLoadingThrottle=ko.observable(false);
        document.querySelector('#messageItem > .bodyText').textContent='Selected fictional message';
        window.stress={requests:0,messageReads:0,nativeOpens:0,mutations:0};
        const ready=new MutationObserver(()=>{
            if(!stress.readyAt&&readerVM.message()?.uid===200
                &&document.querySelectorAll('.pw-conversation-card').length===199){
                stress.readyAt=performance.now();stress.visible=!document.hidden;ready.disconnect();
            }
        });
        ready.observe(document.getElementById('V-MailMessageView'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
        listVM.selector={oCallbacks:{ItemSelect(model){
            ++stress.nativeOpens;stress.opened=performance.now();readerVM.message(model);
            document.querySelector('#messageItem > .bodyText').textContent='Active fictional message';
        }}};
        const other=rl.pluginRemoteRequest;
        rl.pluginRemoteRequest=(cb,action,params)=>{
            if(action!=='PiedWebConversation')return other(cb,action,params);
            ++stress.requests;
            stress.finishLookup=()=>cb(0,{Result:{etag:'stress',messages:stressRows,unchanged:false}});
        };
        rl.app.Remote.post=async()=>{++stress.messageReads;return {Result:{plain:'Fictional preview'}};};
        ko.applyBindingAccessorsToNode(document.getElementById('V-MailMessageList'),{css:()=>({})},listVM);
        ko.applyBindingAccessorsToNode(document.getElementById('V-MailMessageView'),{css:()=>({})},readerVM);
    });
    await p.evaluate(()=>{stress.started=performance.now();});
    await p.addScriptTag({url:fixtureBase+'/.local-work/pied-web-ux/conversation-thread.js'});
    await p.waitForFunction(()=>stress.finishLookup);
    const firstReadableMs=await p.evaluate(()=>{
        const body=document.querySelector('#messageItem > .bodyText');
        if(!body.getClientRects().length||body.textContent!=='Selected fictional message')
            throw new Error('Reader is hidden while the exchange is pending');
        const elapsed=performance.now()-stress.started;
        stress.lookupReleased=performance.now();stress.finishLookup();return elapsed;
    });
    await p.waitForFunction(()=>readerVM.message()?.uid===200
        &&document.querySelectorAll('.pw-conversation-card').length===199);
    const sample=await p.evaluate(()=>{
        const result={afterLookupMs:stress.readyAt-stress.lookupReleased,visible:stress.visible,
            requests:stress.requests,messageReads:stress.messageReads,cards:document.querySelectorAll('.pw-conversation-card').length};
        stableStressCards=[...document.querySelectorAll('.pw-conversation-card')];
        stressObserver=new MutationObserver(records=>{stress.mutations+=records.filter(r=>r.type==='childList').length;});
        document.querySelectorAll('.pw-conversation-cards').forEach(node=>stressObserver.observe(node,{subtree:true,childList:true}));
        readerVM.messageLoadingThrottle(true);readerVM.messageLoadingThrottle(false);return result;
    });
    await p.waitForTimeout(220);
    sample.stable=await p.evaluate(()=>{
        stressObserver.disconnect();return stress.mutations===0&&stableStressCards.every((node,i)=>node===document.querySelectorAll('.pw-conversation-card')[i]);
    });
    if(!sample.visible||sample.requests!==1||sample.cards!==199||!sample.stable||sample.messageReads>1)throw new Error('Conversation stress contract failed '+JSON.stringify(sample));
    results.push({firstReadableMs,...sample});
}
console.log(JSON.stringify({fixture:'200 messages with a held lookup and mocked transport',results}));
