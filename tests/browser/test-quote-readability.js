const page=await browser.getPage('nextsnapmail-quote-readability');
await page.setViewportSize({width:1280,height:800});
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader',{waitUntil:'domcontentloaded'});
await page.evaluate(()=>{
    const nativeGet=rl.settings.get;
    window.quoteCollapse=1;
    rl.settings.get=key=>key==='CollapseBlockquotes'?quoteCollapse:nativeGet(key);
});
await page.evaluate(()=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='/.local-work/pied-web-ux/quote-readability.js?outlook='+Date.now();
    script.onload=resolve;script.onerror=()=>reject(Error('quote-readability load failed'));
    document.head.append(script);
}));
const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
await page.evaluate(()=>{
    document.documentElement.lang='fr';
    window.quoteFixtures=[];
    window.mountQuoteFixture=(html,collapse=1)=>{
        quoteCollapse=collapse;
        const body=document.createElement('div');
        body.className='b-text-part';body.innerHTML=html;
        readerVM.viewModelDom.querySelector('#messageItem').append(body);
        quoteFixtures.push(body);
        return body;
    };
    mountQuoteFixture('<div class="msg-WordSection1">'
        +'<p>Réponse active</p>'
        +'<div style="border:none;border-top:solid #e1e1e1 1pt;padding:3pt 0 0">'
        +'<p><b>De :</b> Camille<br><b>Envoyé :</b> lundi<br><b>À :</b> Alex<br><b>Objet :</b> Projet</p></div>'
        +'<p>Premier message</p><div>Suite de l’historique</div></div>');
    fixtureErrors=[];
    dispatchEvent(new CustomEvent('rl-view-model',{detail:readerVM}));
});
check('Outlook desktop history becomes one native collapsed quotation',await page.evaluate(()=>{
    const body=quoteFixtures[0];
    const details=body.querySelector('details.sm-bq-switcher.pw-outlook-quote');
    return !!details && !details.open && details.lastElementChild?.tagName==='BLOCKQUOTE'
        && details.previousElementSibling?.textContent==='Réponse active'
        && details.querySelector('blockquote').textContent.includes('Premier message')
        && !details.querySelector('blockquote').textContent.includes('Réponse active');
}));
check('Generated disclosure has the localized native label and action',await page.evaluate(()=>{
    const summary=quoteFixtures[0].querySelector('.pw-outlook-quote > summary');
    return summary.textContent==='Afficher la citation'
        && summary.getAttribute('aria-label')==='Afficher la citation'
        && summary.title==='Afficher la citation';
}));
await page.evaluate(()=>{
    const fixture=quoteFixtures[0];
    fixture.querySelector('.pw-outlook-quote').open=true;
    fixture.append(Object.assign(document.createElement('span'),{hidden:true}));
});
await page.waitForTimeout(50);
check('A manual Outlook quote choice survives later body mutations',await page.evaluate(()=>{
    const details=quoteFixtures[0].querySelector('.pw-outlook-quote');
    return details.open && details.querySelector(':scope > summary').textContent==='Citation'
        && details.querySelector(':scope > summary').getAttribute('aria-label')==='Replier la citation';
}));
await page.evaluate(()=>mountQuoteFixture('<div class="mail-body"><p>Current answer</p>'
    +'<div dir="ltr"><b>From:</b> Pat<br><b>Sent:</b> Monday<br><b>To:</b> Lee<br><b>Subject:</b> Plan</div>'
    +'<div>Earlier message</div></div>'));
await page.waitForTimeout(30);
check('Outlook web header without a border is recognized structurally',await page.evaluate(()=>{
    const fixture=quoteFixtures[1];
    const details=fixture.querySelector('.pw-outlook-quote');
    return !!details && details.querySelector('blockquote').textContent.includes('Earlier message')
        && !details.querySelector('blockquote').textContent.includes('Current answer');
}));
await page.evaluate(()=>mountQuoteFixture('<p>Visible content</p><div style="border-top:1px solid #aaa">'
    +'<b>Note:</b><br>one<br>two</div><p>Still visible</p>'));
await page.waitForTimeout(30);
check('An ordinary ruled note is not mistaken for Outlook history',await page.evaluate(() =>
    !quoteFixtures[2].querySelector('.pw-outlook-quote')
));
await page.evaluate(()=>mountQuoteFixture('<p>Visible content</p><div dir="ltr" style="border-top:1px solid #aaa">'
    +'<b>Name:</b> A<br><b>Role:</b> B<br><b>Office:</b> C<br><b>Phone:</b> D</div>'));
await page.waitForTimeout(30);
check('A header-shaped card without trailing history stays visible',await page.evaluate(() =>
    !quoteFixtures[3].querySelector('.pw-outlook-quote')
));
await page.evaluate(()=>mountQuoteFixture('<div class="msg-WordSection1"><p>Answer</p>'
    +'<div style="border-top:1pt solid #ddd"><b>From:</b> A<br><b>Sent:</b> B<br><b>To:</b> C<br><b>Subject:</b> D</div>'
    +'<p>History</p></div>',0));
await page.waitForTimeout(30);
check('The user setting can leave Outlook history expanded',await page.evaluate(() =>
    !quoteFixtures[4].querySelector('.pw-outlook-quote')
));
await page.evaluate(()=>{
    quoteFixtures[4].remove();
    quoteCollapse=1;
    readerVM.viewModelDom.querySelector('#messageItem').append(document.createComment('rescan'));
});
await page.waitForTimeout(30);
await page.evaluate(()=>{
    document.documentElement.classList.remove('pw-theme');
});
await page.waitForTimeout(50);
check('Leaving Pied Web restores the original Outlook sibling structure',await page.evaluate(()=>{
    const root=quoteFixtures[0].querySelector('.msg-WordSection1');
    return !root.querySelector('.pw-outlook-quote') && [...root.children].map(node=>node.tagName).join(',')==='P,DIV,P,DIV';
}));
check('No fixture runtime errors',await page.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:checks.length,checks}));
