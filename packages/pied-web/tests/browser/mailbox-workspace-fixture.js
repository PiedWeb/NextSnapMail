/* Fictional server transport for the real workflow modules. No external requests. */
(() => {
    const snapshots = new Map(), undo = new Map(); let sequence = 0;
    window.mailboxFixtureCalls = [];
    window.mailboxFixtureFailure = '';
    window.mailboxFixtureDelay = 20;
    window.feedGlobalItems?.forEach(item => { item._pwUidValidity = 77; });
    const send = (callback,result) => setTimeout(() => callback(0,{Result:result}),mailboxFixtureDelay);
    window.mailboxFixtureRequest = (params,callback) => {
        if (!['search','prepare','action','undo'].includes(params.operation)) return false;
        mailboxFixtureCalls.push(structuredClone(params));
        if (mailboxFixtureFailure) { send(callback,{error:mailboxFixtureFailure}); return true; }
        if (params.operation === 'search') {
            let state = snapshots.get(params.searchToken);
            if (!state) {
                const rows = params.search === 'aucun-resultat' ? [] : Array.from({length:125},(_,index) => ({
                    ...feedGlobalItems[1],uid:1000+index,subject:'Résultat fictif ' + index,
                    _pwAccountHash:index % 2 ? 'b'.repeat(40) : 'a'.repeat(40),
                    _pwAccountEmail:index % 2 ? 'hello@example.test' : 'alex@example.test',folder:index % 3 ? 'INBOX' : 'Archive',_pwUidValidity:77
                })).filter(item => !params.accountHashes || JSON.parse(params.accountHashes).includes(item._pwAccountHash));
                state = {rows,token:'search-' + (++sequence)}; snapshots.set(state.token,state);
            }
            const offset = Number(params.offset || 0), limit = Number(params.limit || 50);
            send(callback,{items:state.rows.slice(offset,offset+limit),accounts:[],total:state.rows.length,offset,limit,searchToken:state.token});
        } else if (params.operation === 'prepare') {
            const source = snapshots.get(params.searchToken), rows = params.items ? JSON.parse(params.items) : source?.rows
                || (params.uids ? JSON.parse(params.uids).map(uid => ({uid,folder:params.folder})) : Array.from({length:451},(_,index) => ({uid:index+1,folder:params.folder || 'INBOX'})));
            const token = 'selection-' + (++sequence), state = {token,rows,count:rows.length,cursor:0,groups:[{folder:params.folder || (source ? 'Archive' : 'INBOX')} ]};
            snapshots.set(token,state); send(callback,state);
        } else if (params.operation === 'action') {
            const state = snapshots.get(params.token);
            if (!state || Number(params.cursor) !== state.cursor) send(callback,{error:'uncertain'});
            else {
                state.cursor = Math.min(state.count,state.cursor+200); const done = state.cursor === state.count;
                const result = {cursor:state.cursor,count:state.count,done,failures:[]};
                if (done && params.action === 'trash') { result.undoToken = 'undo-' + (++sequence); undo.set(result.undoToken,state.count); }
                send(callback,result);
            }
        } else {
            const count = undo.get(params.undoToken);
            if (count == null) send(callback,{error:'expired'});
            else { undo.delete(params.undoToken); send(callback,{cursor:count,count,done:true,failures:[]}); }
        }
        return true;
    };
})();
