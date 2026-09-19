const p=await browser.getPage('reader-signature-cleanup');
await p.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>!!window.PiedWebUx?.markdown?.fromMessageHtml);
const result=await p.evaluate(()=>{
    const convert=PiedWebUx.markdown.fromMessageHtml;
    const signatureOne=`<p>Le dossier est prêt.</p>
        <table><tbody><tr><td><table><tr><td><img data-x-src="https://example.test/logo.png" alt="logo.png"></td></tr></table></td>
        <td><h2><span>Camille Exemple</span></h2><p>Responsable de communication</p><div>Association des Montagnes</div>
        <table><tr><td style="height:30px"></td></tr><tr><td><img data-x-src="https://example.test/phone.png" alt="phone"></td><td>04 11 22 33 44</td></tr>
        <tr><td><img data-x-src="https://example.test/email.png" alt="email"></td><td><a href="mailto:camille@example.test">camille@example.test</a></td></tr>
        <tr><td><img data-x-src="https://example.test/web.png" alt="website"></td><td><a href="https://example.test">example.test</a></td></tr>
        <tr><td></td><td>Place des Fleurs, 26000 Exempleville</td></tr></table></td></tr></tbody></table>`;
    const signatureTwo=`<blockquote><p>Message précédent.</p><table><tr><td rowspan="3"><img data-x-src-cid="logo@example.test" alt="image.png"></td>
        <td><span>Alex Martin</span><br><i>Chargé de projets</i></td></tr><tr><td><table>
        <tr><td><img data-x-src-cid="phone@example.test" alt="phone"></td><td>+33 4 55 66 77 88</td></tr>
        <tr><td><img data-x-src-cid="mail@example.test" alt="email"></td><td><a href="mailto:alex@example.test">alex@example.test</a></td></tr>
        <tr><td><img data-x-src-cid="web@example.test" alt="web"></td><td><a href="https://example.test">example.test</a></td></tr></table></td></tr></table></blockquote>`;
    const dataTable='<table><thead><tr><th>Produit</th><th>Prix</th></tr></thead><tbody><tr><td>Carnet</td><td>12 €</td></tr></tbody></table>';
    const first=convert(signatureOne),second=convert(signatureTwo),data=convert(dataTable);
    const compose=PiedWebUx.markdown.fromHtml('<div class="rl-signature" style="color:blue"><b>Camille</b></div>');
    return {first,second,data,compose,errors:fixtureErrors};
});
const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
check('Nested layout signature becomes concise contact lines',result.first.includes('Camille Exemple')&&result.first.includes('Responsable de communication')&&result.first.includes('04 11 22 33 44')&&result.first.includes('Place des Fleurs')&&!result.first.includes('<table'));
check('Signature links remain useful and decorative images disappear',result.first.includes('[camille@example.test](mailto:camille@example.test)')&&result.first.includes('[example.test](https://example.test)')&&!result.first.includes('logo.png')&&!result.first.includes('phone.png'));
check('Quoted CID signature is compact and stays quoted',result.second.includes('> Alex Martin')&&result.second.includes('> +33 4 55 66 77 88')&&result.second.includes('mailto:alex@example.test')&&!result.second.includes('<table')&&!result.second.includes('logo@example.test'));
check('A genuine data table keeps GFM columns',result.data.includes('| Produit | Prix |')&&result.data.includes('| Carnet | 12 € |'));
check('Compose signature preservation is unchanged',result.compose.includes('<div class="rl-signature"'));
check('No fixture runtime errors',result.errors.length===0);
console.log(JSON.stringify({passed:checks.length,checks}));
