/* Presentation of Squire's native controls. No replacement editor or commands. */
(() => {
    'use strict';
    let sequence = 0;
    const icons = window.PiedWebUx?.composerIcons;
    if (!icons) return;
    const active = () => document.documentElement.classList.contains('pw-theme');
    const fr = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const names = {bold:'bold',italic:'italic',underline:'underline',strike:'strikethrough',sub:'subscript',sup:'superscript',
        ul:'list',ol:'list-ordered',quote:'quote',indentDecrease:'list-indent-decrease',indentIncrease:'list-indent-increase',
        link:'link',imageUrl:'image',imageUpload:'image-plus',undo:'undo-2',redo:'redo-2',removeStyle:'remove-formatting',
        textColor:'baseline',backgroundColor:'highlighter',dir_ltr:'pilcrow-left',dir_rtl:'pilcrow-right'};
    const svg = name => {
        const template = document.createElement('template');
        template.innerHTML = icons[name];
        const image = template.content.firstElementChild;
        image.setAttribute('aria-hidden','true'); image.setAttribute('focusable','false');
        return image;
    };
    addEventListener('squire-toolbar', ({detail:{squire:editor,actions}}) => {
        const container = editor.container;
        if (!container.closest('#V-PopupsCompose') || container.dataset.pwComposeTools) return;
        container.dataset.pwComposeTools = '1';
        queueMicrotask(() => {
            const toolbar = container.querySelector('.squire-toolbar');
            if (!toolbar || !actions.views) return;
            const original = [...toolbar.childNodes];
            const children = original.filter(n=>n.nodeType===1 && n.classList.contains('btn-group')).map(group=>[group,[...group.childNodes]]);
            const controls = [...toolbar.querySelectorAll('[data-action]')];
            const colorInput = toolbar.querySelector('input[type="color"]'), colorTabIndex = colorInput?.tabIndex;
            const saved = controls.map(node=>({node,html:node.innerHTML,tabIndex:node.tabIndex,aria:node.getAttribute('aria-label')}));
            const button = name => controls.find(node=>node.dataset.action===name);
            const group = (name,label) => {
                const el=document.createElement('div');el.className='btn-group pw-compose-group';
                el.dataset.group=name;el.setAttribute('role','group');el.setAttribute('aria-label',label);return el;
            };
            const main=document.createElement('div');main.className='pw-compose-main';
            const extra=document.createElement('div');extra.className='pw-compose-extra';extra.id='pw-compose-extra-'+(++sequence);extra.hidden=true;
            const emphasis=group('emphasis',fr()?'Styles du texte':'Text styles'), lists=group('lists',fr()?'Listes':'Lists');
            const insert=group('insert',fr()?'Insérer':'Insert'), styles=group('styles',fr()?'Autres styles':'More styles');
            const paragraph=group('paragraph',fr()?'Paragraphe':'Paragraph'), images=group('images',fr()?'Images':'Images');
            const more=document.createElement('button');more.type='button';more.className='btn pw-compose-more';
            more.setAttribute('aria-controls',extra.id);
            const moreLabel=document.createElement('span');more.append(svg('ellipsis'),moreLabel);
            const updateMore=()=>{
                more.setAttribute('aria-expanded',String(!extra.hidden));
                moreLabel.textContent=extra.hidden?(fr()?'Plus':'More'):(fr()?'Moins':'Less');
                more.title=extra.hidden?(fr()?'Plus d’options de mise en forme':'More formatting options'):(fr()?'Réduire les options':'Hide formatting options');
                more.setAttribute('aria-label',more.title);
            };
            more.addEventListener('click',()=>{extra.hidden=!extra.hidden;updateMore();});
            extra.addEventListener('keydown',event=>{
                if(event.key==='Escape'){event.preventDefault();event.stopPropagation();extra.hidden=true;updateMore();more.focus();}
            });
            const nativeGroup = name => children.find(([node])=>node.id==='squire-toolgroup-'+name)?.[0];
            let enhanced=false, compact;
            const move=(target,keys)=>keys.forEach(key=>{const node=button(key);if(node)target.append(node);});
            const responsive=()=>{
                if(!enhanced)return;
                const narrow=container.clientWidth<720;
                if(compact===narrow)return;
                compact=narrow;toolbar.classList.toggle('pw-compact-tools',narrow);
                if(narrow){extra.prepend(lists);extra.append(nativeGroup('changes'));images.prepend(button('imageUpload'));}
                else{insert.append(button('imageUpload'));main.insertBefore(lists,insert);main.append(nativeGroup('changes'));}
            };
            const adapt=()=>{
                if(active()&&!enhanced){
                    enhanced=true;compact=undefined;container.classList.add('pw-composer-toolbar');
                    if(colorInput)colorInput.tabIndex=-1;
                    saved.forEach(({node})=>{
                        const icon=names[node.dataset.action];if(icon)node.replaceChildren(svg(icon));
                        node.tabIndex=0;
                        if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',node.title || node.dataset.action);
                    });
                    move(emphasis,['bold','italic','underline']);move(lists,['ul','ol']);move(insert,['link','imageUpload']);
                    move(styles,['strike','sub','sup']);move(paragraph,['quote','indentDecrease','indentIncrease']);move(images,['imageUrl']);
                    main.append(nativeGroup('mode'),nativeGroup('views'),emphasis,lists,insert,more,nativeGroup('changes'));
                    extra.append(nativeGroup('font'),nativeGroup('colors'),styles,paragraph,nativeGroup('dir'),images,nativeGroup('clear'));
                    // Keep the native hidden color input inside its original toolbar.
                    toolbar.append(main,extra);original.forEach(node=>{if(node.nodeType===1 && node.classList.contains('btn-group')&&!node.children.length)node.remove();});
                    responsive();updateMore();
                }else if(!active()&&enhanced){
                    enhanced=false;children.forEach(([node,nodes])=>node.replaceChildren(...nodes));
                    if(colorInput)colorInput.tabIndex=colorTabIndex;
                    saved.forEach(({node,html,tabIndex,aria})=>{
                        // Source/Markdown labels belong to the mode adapter and may have changed.
                        if(names[node.dataset.action])node.innerHTML=html;
                        node.tabIndex=tabIndex;aria===null?node.removeAttribute('aria-label'):node.setAttribute('aria-label',aria);
                    });
                    toolbar.replaceChildren(...original);container.classList.remove('pw-composer-toolbar');toolbar.classList.remove('pw-compact-tools');
                    extra.hidden=true;
                }
            };
            toolbar.addEventListener('mousedown',event=>{
                if(enhanced&&event.target.closest('button'))event.preventDefault(); // Preserve the editor selection.
            });
            const resize=new ResizeObserver(responsive);resize.observe(container);
            const theme=new MutationObserver(adapt);theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
            ko.utils.domNodeDisposal.addDisposeCallback(container,()=>{resize.disconnect();theme.disconnect();});
            adapt();
        });
    });
})();
