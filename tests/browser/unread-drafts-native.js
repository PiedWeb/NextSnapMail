/* Fixture: actual 2.38.2 models/revival, with peripheral stores and transport mocked. */
export async function setupUnreadDrafts() {
    const source = await (await fetch('/app/snappymail/v/2.38.2/static/js/app.js')).text();
    const between = (from,to) => {
        const start = source.indexOf(from), end = source.indexOf(to,start);
        if (start < 0 || end < 0) throw new Error('Native model extraction needs review');
        return source.slice(start,end);
    };
    const helper = `const isArray=Array.isArray,forEachObjectEntry=(o,f)=>Object.entries(o).forEach(([k,v])=>f(k,v)),forEachObjectValue=(o,f)=>Object.values(o).forEach(f),dispose=o=>o?.dispose?.();
const addObservablesTo=(o,values)=>forEachObjectEntry(values,(k,v)=>o[k]=ko.observable(v));
const addComputablesTo=(o,values)=>forEachObjectEntry(values,(k,v)=>o[k]=ko.computed(v,{pure:true}));
const FileType={Unknown:0},FileInfo={getExtension:n=>n.split('.').pop(),getType:()=>0,getAttachmentsIconClass:()=>''};
const baseCollator=()=>new Intl.Collator(),FolderUserStore={sentFolder:()=> 'Sent',draftsFolder:()=>window.draftFolder,currentFolder:()=>({optionalTags:()=>[]})};
const SettingsUserStore={viewImages:()=> 'never'},MessageUserStore={message:()=>null};
const msgHtml=message=>({html:message.html()}),plainToHtml=text=>{const e=document.createElement('div');e.textContent=text;return e.innerHTML;};
const encodeHtml=plainToHtml,SettingsGet=key=>rl.settings.get(key),RFC822='message/rfc822',b64EncodeJSONSafe=data=>btoa(JSON.stringify(data));
ko.isObservableArray=ko.isObservableArray|| (value=>ko.isObservable(value)&&!!value.push);
`;
    const script = document.createElement('script');
    script.textContent = '(()=>{'+helper
        +between('\tfunction typeCast(', '\n\tconst\n\t\tQPDecodeParams')
        +between('\tclass AbstractCollectionModel', '\n\tlet\n\t\tcurrentScreen')
        +between('\tclass MessageModel extends', '\n\t// Fullscreen must')
        +between('\tclass MessageCollectionModel extends', '\n\tconst AccountUserStore')
        +'window.NativeDraftCollection=MessageCollectionModel;})();';
    document.head.append(script);
    window.draftFolder = 'INBOX.Brouillons'; window.draftAccount = 'fixture-A'; window.draftRequests=[]; window.openedDrafts=[];
    const get = rl.settings.get; rl.settings.get = key => key === 'accountHash' ? draftAccount : get(key);
    const email = (name,address) => ({'@Object':'Object/Email',name,email:address});
    const attachments = [{'@Object':'Object/Attachment',folder:draftFolder,uid:2,fileName:'document.pdf',mimeType:'application/pdf',cId:'file-2',estimatedSize:1234}];
    window.draftData = [
        {'@Object':'Object/Message',folder:draftFolder,uid:2,hash:'draft-2',flags:[],subject:'Les dernières pistes pour le projet',dateTimestamp:1789217000,to:[email('Camille','camille@example.test')],from:[email('Alex','alex@example.test')],replyTo:[],cc:[],bcc:[],headers:[],attachments,plain:'Bonjour Camille,',html:'<div>Bonjour Camille,<b>voici les pistes.</b><img src="cid:illustration"></div>',inReplyTo:'parent-id',references:'older parent-id',draftInfo:['reply',71,'INBOX']},
        {'@Object':'Object/Message',folder:draftFolder,uid:3,hash:'draft-3',flags:['\\draft'],subject:'Proposition de rendez-vous',dateTimestamp:1789140600,to:[email('Équipe','equipe@example.test')],from:[],replyTo:[],cc:[],bcc:[],headers:[],attachments:[],plain:'Mardi prochain ?',html:''},
        {'@Object':'Object/Message',folder:draftFolder,uid:4,hash:'draft-4',flags:['\\seen'],subject:'Ce brouillon est lu',dateTimestamp:1789140500,to:[],from:[],headers:[],attachments:[]},
        {'@Object':'Object/Message',folder:draftFolder,uid:5,hash:'draft-5',flags:['\\deleted'],subject:'Ce brouillon est supprimé',dateTimestamp:1789140400,to:[],from:[],headers:[],attachments:[]}
    ];
    const inbox = NativeDraftCollection.reviveFromJson([{'@Object':'Object/Message',folder:'INBOX',uid:2,hash:'inbox-2',flags:[],subject:'Mail reçu',to:[],from:[],headers:[],attachments:[]}]);
    inbox.folder='INBOX';inbox.search=''; window.inboxSnapshot=inbox;
    listVM.messageList(inbox); listVM.messageList.page=ko.observable(1); listVM.popupVisibility=ko.observable(false);
    rl.app.messageList=listVM.messageList;
    rl.pluginRemoteRequest = (callback,action,params) => {
        if (action === 'PiedWebUnreadOrder') {
            unreadOrderRequests.push({...params});
            if (Object.hasOwn(params, 'enabled')) unreadOrderEnabled = !!Number(params.enabled);
            if (Object.hasOwn(params, 'behavior')) unreadOrderBehavior = Number(params.behavior);
            return setTimeout(() => callback(window.unreadOrderFailure ? 1 : 0,
                {Result:window.unreadOrderFailure ? {error:'settings'} : {enabled:unreadOrderEnabled, behavior:unreadOrderBehavior}}), 20);
        }
        draftRequests.push({action,...params,account:draftAccount});
        const snapshot = structuredClone(draftData), folderSnapshot = draftFolder;
        const send = () => {
            if (window.draftFailure) return callback(1,{});
            const matching = snapshot.filter(item=>!item.flags.some(flag=>['\\seen','\\deleted'].includes(flag.toLowerCase())))
                .sort((left,right)=>unreadOrderEnabled ? left.dateTimestamp-right.dateTimestamp : right.dateTimestamp-left.dateTimestamp);
            const messages = {'@Object':'Collection/MessageCollection','@Collection':matching.slice(params.offset,params.offset+10),folder:{name:folderSnapshot},offset:params.offset,totalEmails:matching.length};
            callback(0,{Result:{folder:folderSnapshot,messages}});
        };
        if (window.holdDraftList) window.releaseDraftList=send; else setTimeout(send,20);
    };
    rl.app.Remote.post = async (action,trigger,params) => {
        draftRequests.push({action,...params,account:draftAccount});
        const data = structuredClone(draftData.find(item=>item.folder===params.folder&&item.uid===params.uid));
        if (window.holdDraftOpen) await new Promise(resolve=>window.releaseDraftOpen=resolve);
        if (window.failDraftOpen) throw new Error('offline');
        return {Result:data};
    };
    rl.app.showMessageComposer = params => { openedDrafts.push(params); listVM.popupVisibility(true); };
    const plugin = document.createElement('script'); plugin.src='/.local-work/pied-web-ux/unread-drafts.js';
    await new Promise((resolve,reject)=>{plugin.onload=resolve;plugin.onerror=reject;document.head.append(plugin);});
    dispatchEvent(new CustomEvent('rl-view-model',{detail:listVM}));
    window.draftsReady=true;
}
