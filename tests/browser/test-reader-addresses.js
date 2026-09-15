const p=await browser.getPage('reader-addresses');
await p.bringToFront();
await p.setViewportSize({width:1280,height:800});
await p.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader',{waitUntil:'domcontentloaded'});
await p.waitForSelector('#messageItem .informationShortWrp .pw-addresses a.pw-address');
const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
// The confirmation fades in, so its opacity only settles while the page is shown.
const shown=()=>p.waitForFunction(()=>getComputedStyle(document.querySelector('.pw-address-toast')).opacity==='1');
await p.evaluate(()=>{
    window.copiedAddresses=[];
    document.querySelector('#V-PopupsCompose').close();
    window.headerHeight=document.querySelector('#messageItem .messageItemHeader').getBoundingClientRect().height;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copiedAddresses.push(text)}});
});
const row=index=>'#messageItem .informationShortWrp .informationShort:nth-child('+index+')';
check('Recipient rows keep the native address line with the address linked',await p.evaluate(selector=>{
    const line=document.querySelector(selector+' .pw-addresses');
    const links=[...line.querySelectorAll('a.pw-address')].map(link=>link.textContent);
    return line.textContent==='"Robin" <robin@example.test>, marie@example.test'
        && JSON.stringify(links)===JSON.stringify(['robin@example.test','marie@example.test'])
        && getComputedStyle(document.querySelector(selector+' .pw-native-addresses')).display==='none';
},row(2)));
check('An address is labelled, focusable and announces its copy shortcut',await p.evaluate(selector=>{
    const link=document.querySelector(selector+' a.pw-address');
    return link.getAttribute('aria-label')==='Écrire à alex@example.test'
        && link.title.startsWith('Écrire à alex@example.test · ')
        && link.title.endsWith('pour copier l’adresse')
        && link.getAttribute('aria-keyshortcuts')==='Control+Enter'
        && link.tabIndex===0 && getComputedStyle(link).cursor==='pointer';
},row(1)));
check('The reader carries one empty copy region before anything is copied',await p.evaluate(()=>{
    const toast=document.querySelector('.pw-address-toast');
    return document.querySelectorAll('.pw-address-toast').length===1 && toast.getAttribute('role')==='status'
        && toast.getAttribute('aria-live')==='polite' && !toast.textContent
        && getComputedStyle(toast).opacity==='0' && getComputedStyle(toast).pointerEvents==='none';
}));
// Keyboard first: the focus ring is only expected while the keyboard leads.
await p.locator(row(2)+' a.pw-address:first-of-type').press('Control+Enter');
await p.waitForFunction(()=>copiedAddresses.length===1);
await shown();
check('Ctrl+Enter copies the focused address without composing',await p.evaluate(()=>
    copiedAddresses[0]==='robin@example.test' && !composerOpened.length
        && document.querySelector('.pw-address-toast').textContent==='Adresse copiée : robin@example.test'));
check('A focused address shows a visible focus ring',await p.evaluate(selector=>{
    const link=document.querySelector(selector+' a.pw-address'),style=getComputedStyle(link);
    return document.activeElement===link && link.matches(':focus-visible')
        && parseFloat(style.outlineWidth)>=2 && style.outlineStyle==='solid';
},row(2)));
await p.locator(row(2)+' a.pw-address:first-of-type').press('Enter');
check('Enter alone opens a new message for the focused address',await p.evaluate(()=>
    composerOpened.length===1 && composerOpened[0].to==='robin@example.test,"Robin" <robin@example.test>'
        && copiedAddresses.length===1));
await p.locator(row(1)+' a.pw-address').click();
check('A click opens a new message for that address, keeping its display name',await p.evaluate(()=>
    composerOpened.length===2 && composerOpened[1].to==='alex@example.test,"Alex Nguyen" <alex@example.test>'
        && copiedAddresses.length===1));
await p.locator(row(2)+' a.pw-address:last-of-type').click();
check('An address written without a name composes to the bare address',await p.evaluate(()=>
    composerOpened.length===3 && composerOpened[2].to==='marie@example.test'));
await p.locator(row(1)+' a.pw-address').click({modifiers:['Control']});
await p.waitForFunction(()=>copiedAddresses.length===2);
await shown();
check('Ctrl+click copies the bare address instead of opening the composer',await p.evaluate(()=>
    copiedAddresses[1]==='alex@example.test' && composerOpened.length===3));
check('The confirmation names the copied address beside it, without moving the header',await p.evaluate(selector=>{
    const link=document.querySelector(selector+' a.pw-address').getBoundingClientRect();
    const toast=document.querySelector('.pw-address-toast'),box=toast.getBoundingClientRect();
    window.copiedColor=getComputedStyle(toast).color;
    return toast.textContent==='Adresse copiée : alex@example.test'
        && box.bottom<=link.top && box.left>=0 && box.right<=innerWidth
        && document.querySelector('#messageItem .messageItemHeader').getBoundingClientRect().height===headerHeight;
},row(1)));
const copiedAt=Date.now();
await p.waitForFunction(()=>{
    const toast=document.querySelector('.pw-address-toast');
    return !toast.textContent && getComputedStyle(toast).opacity==='0';
},null,{timeout:8000});
check('The confirmation clears itself after a short delay',Date.now()-copiedAt>=1500
    && await p.evaluate(()=>!document.querySelector('.pw-address-toast').dataset.state));
check('The themed sender address is clickable and carries its display name',await p.evaluate(()=>{
    const link=document.querySelector('.messageItemHeader .pw-sender-address');
    return link.classList.contains('pw-address') && link.dataset.pwEmail==='camille@example.test'
        && decodeURIComponent(link.getAttribute('href'))==='mailto:camille@example.test?to="Camille Martin" <camille@example.test>';
}));
check('Expanded details link every address of the message',await p.evaluate(()=>{
    const rows=[...document.querySelectorAll('.informationFull tr')];
    return rows.length===3 && rows.every(row=>row.querySelector('td.pw-addresses a.pw-address'))
        && rows[2].querySelector('a.pw-address').dataset.pwEmail==='studio@example.test'
        && getComputedStyle(rows[0].querySelector('.pw-native-addresses')).display==='none';
}));
await p.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('permission');};document.execCommand=()=>false;});
await p.locator(row(1)+' a.pw-address').click({modifiers:['Control']});
await p.waitForFunction(()=>document.querySelector('.pw-address-toast').dataset.state==='error');
await shown();
check('A refused copy says so visibly and leaves the composer closed',await p.evaluate(()=>{
    const toast=document.querySelector('.pw-address-toast');
    return toast.textContent==='Copie impossible. Réessayez.'
        && getComputedStyle(toast).color!==copiedColor && composerOpened.length===3;
}));
await p.evaluate(()=>document.querySelector('#app-theme-style').dataset.name='NextcloudV25+');
check('Leaving the theme restores the native address text',await p.evaluate(selector=>
    getComputedStyle(document.querySelector(selector+' .pw-addresses')).display==='none'
        && getComputedStyle(document.querySelector(selector+' .pw-native-addresses')).display!=='none',row(1)));
await p.evaluate(()=>document.querySelector('#app-theme-style').dataset.name='PiedWeb@nextcloud');
await p.setViewportSize({width:320,height:700});
check('A narrow reader keeps the address and its confirmation on screen',await p.evaluate(async selector=>{
    const link=document.querySelector(selector+' a.pw-address');
    navigator.clipboard.writeText=async()=>{};
    link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true}));
    await new Promise(resolve=>setTimeout(resolve,150));
    const box=document.querySelector('.pw-address-toast').getBoundingClientRect();
    return link.getBoundingClientRect().right<=innerWidth && box.left>=0 && box.right<=innerWidth
        && document.documentElement.scrollWidth<=innerWidth;
},row(2)));
check('No fixture runtime errors',await p.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:checks.length,checks}));
