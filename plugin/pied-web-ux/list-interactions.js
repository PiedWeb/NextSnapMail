(() => {
    'use strict';
    const active=()=>document.documentElement.classList.contains('pw-theme');
    const editable=node=>node instanceof Element && !!node.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
    addEventListener('rl-view-model', ({detail:vm})=>{
        if (vm.viewModelTemplateID!=='MailMessageList' || vm.pwListInteractions) return;
        vm.pwListInteractions=true;
        const dom=vm.viewModelDom, list=vm.messageList;
        dom.dataset.pwSelectionVersion='1.7.15';
        const available=()=>active() && dom.isConnected && dom.getClientRects().length>0
            && !dom.closest('[hidden],[inert]') && getComputedStyle(dom).visibility!=='hidden'
            && !vm.popupVisibility?.() && !list.isLoading?.() && !list.loading?.();

        const bar=document.createElement('div');bar.className='pw-selection-bar';bar.hidden=true;
        const countLabel=document.createElement('span');countLabel.className='pw-selection-count';countLabel.setAttribute('role','status');
        const finish=document.createElement('button');finish.type='button';finish.className='pw-selection-finish';
        bar.append(countLabel,finish);
        dom.querySelector(':scope > .btn-toolbar')?.after(bar);
        const selectedCount=ko.computed(()=>list().filter(message=>ko.unwrap(message.checked)).length);
        const syncSelection=()=>{
            const count=active() ? selectedCount() : 0;
            dom.classList.toggle('pw-selection-mode',count>0);
            bar.hidden=!count;
            const fr=(document.documentElement.lang||'fr').startsWith('fr');
            countLabel.textContent=fr ? `${count} message${count>1?'s':''} sélectionné${count>1?'s':''}`
                : `${count} message${count===1?'':'s'} selected`;
            finish.textContent=fr ? 'Terminer' : 'Done';
            finish.setAttribute('aria-label',fr ? 'Terminer la sélection' : 'Finish selection');
        };
        selectedCount.subscribe(syncSelection);
        const clearSelection=()=>{
            vm.selector?.unselect();
            list().forEach(message=>message.checked?.(false));
            syncSelection();
        };
        finish.addEventListener('click',clearSelection);
        const toggleMessage=message=>{
            const wasChecked=!!ko.unwrap(message.checked);
            if (!wasChecked || selectedCount()===1) vm.selector?.unselect();
            if (!wasChecked || selectedCount()>1) vm.selector?.focusedItem?.(message);
            message.checked(!wasChecked);
            syncSelection();
        };
        const listedRow=target=>{
            const row=target.closest('.messageListItem');
            if (!row || !dom.contains(row)) return null;
            const message=ko.dataFor(row);
            return message?.folder===list().folder && list().includes(message)
                && typeof message.checked==='function' ? {row,message} : null;
        };
        const nativeControl=target=>!!target.closest('a,button,input,textarea,select,.messageCheckbox,.flagParent,.threads-len');
        const themeObserver=new MutationObserver(syncSelection);
        themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','lang']});
        syncSelection();
        ko.utils.domNodeDisposal.addDisposeCallback(dom,()=>{selectedCount.dispose();themeObserver.disconnect();bar.remove();});

        // The reader can retain the native shortcut scope after checking list rows.
        // Checked messages must take precedence over that reader's current message.
        addEventListener('keydown',event=>{
            if (event.key!=='Delete' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
                || event.isComposing || editable(event.target) || !available()) return;
            if (!list().some(message=>ko.unwrap(message.checked))) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (!event.repeat && vm.deleteCommand?.canExecute?.()!==false) vm.deleteCommand?.();
        },true);

        let gesture, suppressClick;
        const cancel=()=>{
            if (!gesture) return;
            const {row,id,hint,timer}=gesture;
            gesture=null;
            clearTimeout(timer);
            row.classList.remove('pw-swiping','pw-swipe-ready');
            row.style.removeProperty('--pw-swipe-offset');
            hint?.remove();
            if (row.hasPointerCapture?.(id)) row.releasePointerCapture(id);
        };
        const valid=g=>available() && g.snapshot===list() && g.row.isConnected
            && ko.dataFor(g.row)===g.message && list().includes(g.message)
            && g.message.folder===list().folder;
        dom.addEventListener('pointerdown',event=>{
            if (gesture) {cancel();return;}
            if (event.pointerType!=='touch' || !event.isPrimary || !available() || selectedCount()
                || !(event.target instanceof Element) || nativeControl(event.target)) return;
            const entry=listedRow(event.target);
            if (!entry) return;
            const {row,message}=entry;
            gesture={row,message,snapshot:list(),id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,
                threshold:Math.min(120,Math.max(72,row.clientWidth*.28))};
            const g=gesture;
            g.timer=setTimeout(()=>{
                if (gesture!==g || !valid(g) || g.hint) return;
                g.longPress=true;
                toggleMessage(g.message);
            },550);
        });
        dom.addEventListener('pointermove',event=>{
            const g=gesture;
            if (!g || g.id!==event.pointerId) return;
            if (!valid(g)) {cancel();return;}
            const dx=event.clientX-g.x, dy=event.clientY-g.y;
            if (g.longPress) {event.preventDefault();return;}
            if (Math.abs(dx)>10 || Math.abs(dy)>10) {clearTimeout(g.timer);g.timer=0;}
            if (!g.hint) {
                if (Math.abs(dy)>12 && Math.abs(dy)>=Math.abs(dx)) {cancel();return;}
                if (Math.abs(dx)<20 || Math.abs(dx)<Math.abs(dy)*1.5) return;
                const hint=document.createElement('span'); hint.className='pw-swipe-hint';
                hint.setAttribute('aria-hidden','true');
                const icon=document.createElement('i');icon.className='fontastic';icon.textContent='🗑';
                const label=document.createElement('span');label.textContent=(document.documentElement.lang || 'fr').startsWith('fr') ? 'Supprimer' : 'Delete';
                hint.append(icon,label);g.row.append(hint);g.hint=hint;
                g.row.classList.add('pw-swiping');
                g.row.setPointerCapture?.(g.id);
            }
            event.preventDefault();
            g.dx=dx;g.hint.style.width=g.threshold+'px';
            g.hint.style.left=dx>0 ? '0' : 'auto';g.hint.style.right=dx>0 ? 'auto' : '0';
            g.row.style.setProperty('--pw-swipe-offset',Math.sign(dx)*Math.min(Math.abs(dx),g.threshold+24)+'px');
            g.row.classList.toggle('pw-swipe-ready',Math.abs(dx)>=g.threshold);
        },{passive:false});
        dom.addEventListener('pointerup',event=>{
            const g=gesture;
            if (!g || g.id!==event.pointerId) return;
            if (g.longPress) {
                event.preventDefault();
                suppressClick={row:g.row,until:performance.now()+500};
                cancel();return;
            }
            const commit=!!g.hint && Math.abs(g.dx)>=g.threshold && valid(g);
            if (g.hint) {event.preventDefault();suppressClick={row:g.row,until:performance.now()+700};}
            cancel();
            if (!commit) return;
            // Follow native conversation deletion semantics without changing checkboxes.
            const uids=new Set([g.message.uid]);
            if (g.message.threadsLen?.()>1) g.message.threads().forEach(uid=>uids.add(uid));
            // FolderType.Trash = 5 in the supported SnappyMail version. The native
            // method retains missing-folder handling and permanent-delete confirmation.
            window.rl.app.moveMessagesToFolderType(5,g.message.folder,uids);
        });
        dom.addEventListener('pointercancel',cancel);
        // Touch starts with implicit capture on the subject/sender. Transferring
        // capture to its row releases that child; it must not cancel the gesture.
        dom.addEventListener('lostpointercapture',event=>{
            if (gesture?.row===event.target) cancel();
        });
        dom.addEventListener('contextmenu',event=>{
            if ((gesture && gesture.row.contains(event.target))
                || (suppressClick && performance.now()<suppressClick.until && suppressClick.row.contains(event.target))) event.preventDefault();
        },true);
        dom.addEventListener('click',event=>{
            if (suppressClick && performance.now()<suppressClick.until
                && suppressClick.row.contains(event.target)) {
                event.preventDefault();event.stopImmediatePropagation();suppressClick=null;
                return;
            }
            if (!available() || !(event.target instanceof Element) || nativeControl(event.target)) return;
            const entry=listedRow(event.target);
            if (!entry || event.altKey) return;
            const start=(event.ctrlKey||event.metaKey) && !event.shiftKey;
            if (!start && (!selectedCount() || event.shiftKey)) return;
            event.preventDefault();event.stopImmediatePropagation();
            toggleMessage(entry.message);
        },true);
        dom.addEventListener('dblclick',event=>{
            if (selectedCount() && event.target instanceof Element && listedRow(event.target)) {
                event.preventDefault();event.stopImmediatePropagation();
            }
        },true);
        addEventListener('keydown',event=>{
            if (event.key!=='Escape' || !selectedCount() || !available() || editable(event.target)) return;
            event.preventDefault();event.stopImmediatePropagation();clearSelection();
        },true);
        list.subscribe(cancel);
        addEventListener('blur',cancel);
        addEventListener('resize',cancel);
    });
})();
