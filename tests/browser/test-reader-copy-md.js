const p=await browser.getPage('reader-copy-md');
await p.setViewportSize({width:1280,height:800});
await p.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>!!window.PiedWebUx?.markdown?.fromMessageHtml);
const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
await p.evaluate(()=>{
    window.copiedMarkdown=[];
    document.querySelector('#V-PopupsCompose').close();
    readerVM.message().body=document.querySelector('.bodyText > .messageBody');
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copiedMarkdown.push(text)}});
});
const button=p.locator('.pw-copy-md');
check('Reader toolbar has a labeled, available Markdown copy action',await p.evaluate(()=>{
    const button=document.querySelector('.pw-copy-md');
    return button.closest('.pw-reader-commands') && button.title==='Copier en MD' && !button.disabled;
}));
await button.click();
await p.waitForFunction(()=>document.querySelector('.pw-copy-md').dataset.state==='copied');
check('Click copies only the formatted body as Markdown',await p.evaluate(()=>{
    const text=copiedMarkdown[0];
    return text.startsWith('Bonjour Robin,') && text.includes('**jeudi à 10 h**')
        && text.includes('Camille Martin') && !text.includes('<p style=')
        && !text.includes('Les pistes pour la nouvelle identité')
        && document.querySelector('.pw-copy-md-status').textContent==='Copié en MD';
}));
await p.evaluate(()=>{readerVM.message().body.innerHTML='<p>Réponse</p><details class="sm-bq-switcher"><summary>Afficher la citation</summary><blockquote><p>Texte cité</p></blockquote></details>';});
await button.press('Enter');
await p.waitForFunction(()=>copiedMarkdown.length===2);
check('Keyboard copy includes collapsed quotations without disclosure text',await p.evaluate(()=>copiedMarkdown[1].includes('> Texte cité')&&!copiedMarkdown[1].includes('Afficher la citation')));
await p.evaluate(()=>{
    navigator.clipboard.writeText=async()=>{throw Error('permission');};
    document.execCommand=command=>{if(command==='copy'){copiedMarkdown.push(document.activeElement.value);return true;}return false;};
});
await button.click();
await p.waitForFunction(()=>copiedMarkdown.length===3);
check('Legacy clipboard fallback works after a rejected write',await p.evaluate(()=>copiedMarkdown[2].includes('> Texte cité')&&document.activeElement.classList.contains('pw-copy-md')));
await p.evaluate(()=>readerVM.messageVisible(false));
check('Copy is unavailable when the native reader has no visible message',await p.evaluate(()=>document.querySelector('.pw-copy-md').disabled));
await p.evaluate(()=>readerVM.messageVisible(true));
await p.setViewportSize({width:320,height:700});
check('The extra control stays within the narrow mobile toolbar',await p.evaluate(()=>{
    const button=document.querySelector('.pw-copy-md').getBoundingClientRect();
    return button.width>=27 && button.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth;
}));
check('No fixture runtime errors',await p.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:checks.length,checks}));
