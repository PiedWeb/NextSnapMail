const base='http://127.0.0.1:8876/.local-work/images-native-preview.html';
const checks=[];
const check=(label,ok)=>{if(!ok)throw new Error(label);checks.push(label);console.log('PASS '+label);};
const list=await browser.getPage('pied-web-polish-list');
await list.setViewportSize({width:1440,height:900});
await list.goto(base+'?mode=list&side=1&shell=1&listOnly=1');
await list.waitForSelector('.messageListItem');
await list.evaluate(()=>{
    const row=document.querySelector('.messageListItem');
    const count=document.createElement('div');count.className='threads-len';
    count.textContent='14/2';count.dataset.unseen='2';
    row.querySelector('.subjectParent').after(count);
    row.querySelector('.attachmentParent').innerHTML='<i class="icon-file-text"></i>';
    document.querySelectorAll('.messageListItem')[1].querySelector('.attachmentParent').innerHTML='<i class="icon-file-calendar"></i>';
    const back=document.createElement('div');back.className='listThreadUidDesc';
    back.textContent='Retour à la liste des messages';
    document.querySelector('.messageList .b-content').prepend(back);
});
await list.waitForSelector('.threads-len[data-pw-total]');
check('The conversation count sits on the sender line, before the hour, with centered digits',await list.evaluate(()=>{
    const row=document.querySelector('.messageListItem'),count=row.querySelector('.threads-len');
    const attachment=row.querySelector('.attachmentParent'),time=row.querySelector('time');
    const a=count.getBoundingClientRect(),b=attachment.getBoundingClientRect();
    const c=time.getBoundingClientRect(),style=getComputedStyle(count);
    return a.top<b.top && a.right<=c.left+1 && Math.abs(a.top-c.top)<12
        && Math.abs(c.right-b.right)<2 && style.alignItems==='center'
        && style.justifyContent==='center' && count.dataset.pwTotal==='14';
}));
check('A text attachment uses the same quiet paperclip glyph as other attachments',await list.evaluate(()=>{
    const icon=document.querySelector('.messageListItem .attachmentParent i');
    const style=getComputedStyle(icon,'::before');
    return style.content==='""' && style.maskImage!=='none' && style.backgroundColor!=='rgba(0, 0, 0, 0)';
}));
check('A sole calendar attachment keeps its native calendar glyph',await list.evaluate(()=>{
    const icon=document.querySelectorAll('.messageListItem')[1].querySelector('.attachmentParent i');
    const style=getComputedStyle(icon,'::before');
    return icon.classList.contains('icon-file-calendar')&&getComputedStyle(icon).fontSize==='17px'
        &&style.content.includes('📅')&&style.maskImage==='none';
}));
check('The conversation toggle centers its icon and the back-to-list control stays compact',await list.evaluate(()=>{
    const button=document.querySelector('button.pw-threads'),pseudo=getComputedStyle(button,'::before');
    const back=document.querySelector('.listThreadUidDesc'),style=getComputedStyle(back);
    return getComputedStyle(button).justifyContent==='center' && pseudo.width==='18px'
        && back.getBoundingClientRect().width<document.querySelector('.messageList').getBoundingClientRect().width-20
        && style.borderTopWidth==='0px';
}));
check('Both native column grips have room to resize in either direction',await list.evaluate(()=>{
    const left=document.querySelector('#rl-left'),messages=document.querySelector('.messageList');
    const oldLeft=left.getAttribute('style'),oldMessages=messages.getAttribute('style');
    left.style.width='310px';messages.style.width='610px';
    const wide=Math.abs(left.getBoundingClientRect().width-310)<2&&Math.abs(messages.getBoundingClientRect().width-610)<2;
    left.style.width='215px';messages.style.width='380px';
    const narrow=Math.abs(left.getBoundingClientRect().width-215)<2&&Math.abs(messages.getBoundingClientRect().width-380)<2;
    if(oldLeft===null)left.removeAttribute('style');else left.setAttribute('style',oldLeft);
    if(oldMessages===null)messages.removeAttribute('style');else messages.setAttribute('style',oldMessages);
    return wide&&narrow&&[...document.querySelectorAll('.resizer')].every(grip=>getComputedStyle(grip).cursor==='col-resize');
}));
const reader=await browser.getPage('pied-web-polish-reader');
await reader.setViewportSize({width:1440,height:900});
await reader.goto(base+'?mode=reader&side=1');
await reader.waitForSelector('#messageItem .bodyText');
await reader.evaluate(()=>{
    document.querySelector('#V-PopupsCompose')?.close();
    const extras=document.querySelector('.pw-message-extras');
    const calendar=document.createElement('button');calendar.className='btn pw-import-calendar';
    calendar.textContent='Ajouter au calendrier';extras.append(calendar);
    const sub=document.createElement('div');sub.className='bodySubHeader';
    sub.innerHTML='<details class="attachmentsPlace" open><summary>Pièces jointes</summary><ul class="attachmentList"><li class="attachmentItem"><div class="attachmentIcon"><i class="iconMain icon-file-calendar"></i></div><div class="attachmentNameParent"><div class="attachmentName">invitation.ics</div><div class="attachmentSize">2 KiB</div></div><div class="checkboxAttachment">☑</div></li></ul><i class="fontastic controls-handle">⚙</i><div class="attachmentsControls" style="display:none"><span><i class="icon-file-archive"></i><span class="g-ui-link">Télécharger le zip</span></span></div></details>';
    document.querySelector('#messageItem .bodyText').before(sub);
});
check('A message image keeps its shape against a matching background',await reader.evaluate(()=>{
 const body=document.querySelector('#V-MailMessageView .bodyText');
 let image=body.querySelector('img');
 if(!image){image=document.createElement('img');
  image.src='data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  image.width=80;image.height=40;body.appendChild(image);}
 const s=getComputedStyle(image);
 const alpha=Number((s.outlineColor.match(/[\d.]+/g)||[])[3]??1);
 return s.outlineStyle==='solid'&&parseFloat(s.outlineWidth)===1
  &&parseFloat(s.outlineOffset)===-1&&alpha>0&&alpha<0.2;
}));
check('Reader typography is compact and sender name and address share one size',await reader.evaluate(()=>{
    const name=document.querySelector('.pw-sender-name'),address=document.querySelector('.pw-sender-address');
    const subject=document.querySelector('.b-message > .messageItemHeader .subjectParent');
    const senderLine=document.querySelector('.b-message > .messageItemHeader .informationShort:has(.pw-from)');
    return getComputedStyle(name).fontSize===getComputedStyle(address).fontSize
        &&getComputedStyle(subject).fontSize==='18px'
        &&parseFloat(getComputedStyle(subject).lineHeight)<26
        &&getComputedStyle(senderLine).marginTop==='0px';
}));
check('The reply actions have a visible separator',await reader.evaluate(()=>{
    const style=getComputedStyle(document.querySelector('.pw-reading-actions'));
    return style.borderTopWidth==='1px'&&style.paddingTop==='18px';
}));
await reader.locator('.pw-message-extras .pw-import-calendar').last().hover();
check('Calendar action follows message metadata as a secondary inline action',await reader.evaluate(()=>{
    const meta=document.querySelector('#messageItem > .messageItemHeader'),button=document.querySelector('.pw-import-calendar');
    const hovered=document.querySelector('.pw-message-extras .pw-import-calendar:last-child');
    const style=getComputedStyle(button);
    return meta.nextElementSibling===button.parentElement&&style.borderTopWidth==='0px'
        &&style.backgroundColor==='rgba(0, 0, 0, 0)'
        &&getComputedStyle(hovered).backgroundColor!=='rgba(0, 0, 0, 0)'
        &&hovered.getBoundingClientRect().top-meta.getBoundingClientRect().bottom>=6;
}));
check('Attachment uses a compact file tile with no oversized glyph or overflow',await reader.evaluate(()=>{
    const item=document.querySelector('.attachmentItem'),icon=item.querySelector('.iconMain');
    const box=item.getBoundingClientRect();
    return box.height===72&&box.width<=280&&getComputedStyle(icon).fontSize==='25px'
        &&getComputedStyle(icon).filter==='none'&&document.documentElement.scrollWidth<=innerWidth;
}));
check('A single desktop attachment has breathing room without a redundant settings control',await reader.evaluate(()=>{
    const place=document.querySelector('.attachmentsPlace');
    return getComputedStyle(place).paddingBottom==='18px'
        &&getComputedStyle(place.querySelector('.controls-handle')).display==='none'
        &&getComputedStyle(place.querySelector('.attachmentsControls')).display==='none'
        &&getComputedStyle(place.querySelector('.checkboxAttachment')).display==='none';
}));
await reader.evaluate(()=>{
    const list=document.querySelector('.attachmentList');
    list.append(list.firstElementChild.cloneNode(true));
});
check('Multiple desktop attachments expose selection and the native zip action directly',await reader.evaluate(()=>{
    const place=document.querySelector('.attachmentsPlace');
    return getComputedStyle(place.querySelector('.attachmentsControls')).display==='flex'
        &&getComputedStyle(place.querySelector('.attachmentsControls > span')).display.includes('flex')
        &&[...place.querySelectorAll('.checkboxAttachment')].every(box=>getComputedStyle(box).display!=='none');
}));
await reader.setViewportSize({width:390,height:844});
await reader.waitForFunction(()=>document.querySelector('.b-message > .messageItemHeader')?.nextElementSibling?.classList.contains('pw-message-extras'));
check('Phone keeps its native footer and attachment geometry',await reader.evaluate(()=>{
    const footer=getComputedStyle(document.querySelector('.pw-reading-actions'));
    const attachment=document.querySelector('.attachmentItem').getBoundingClientRect();
    const extras=document.querySelector('.pw-message-extras');
    const originalHeader=document.querySelector('.b-message > .messageItemHeader');
    const senderLine=originalHeader.querySelector('.informationShort:has(.pw-from)');
    return footer.borderTopWidth==='0px'&&attachment.height!==72
        &&getComputedStyle(senderLine).marginTop==='8px'
        &&getComputedStyle(document.querySelector('.controls-handle')).display!=='none'
        &&getComputedStyle(document.querySelector('.attachmentsControls')).display==='none'
        &&originalHeader.nextElementSibling===extras
        &&document.documentElement.scrollWidth<=innerWidth;
}));
console.log(JSON.stringify({passed:checks.length}));
