const p=await browser.getPage('nextsnapmail-desktop-scan');p.setDefaultTimeout(5000);
await p.setViewportSize({width:1440,height:900});await p.emulateMedia({colorScheme:'light'});
await p.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1');
await p.waitForSelector('.pw-read-toggle');
await p.evaluate(()=>{
 window.fixtureRowClicks=0;
 const row=demoRows[0];row.addEventListener('click',()=>fixtureRowClicks++);
 row.querySelector('.attachmentParent').innerHTML='<i class="icon-file-image"></i>';
});
const results=[];const check=(name,ok)=>{if(!ok)throw new Error(name);results.push(name);console.log('PASS '+name);};
check('Desktop read dots reflect the native unread state and have an accessible action',await p.evaluate(()=>{
 const first=demoRows[0].querySelector('.pw-read-toggle'),read=demoRows[3].querySelector('.pw-read-toggle');
 return document.querySelectorAll('.pw-read-toggle').length===demoRows.length&&first.dataset.unread==='1'&&read.dataset.unread==='0'&&first.title==='Marquer comme lu'&&read.title==='Marquer comme non lu'&&getComputedStyle(first,'::before').backgroundColor!==getComputedStyle(read,'::before').backgroundColor;
}));
check('The attachment occupies a dedicated column after the star',await p.evaluate(()=>{
 const row=demoRows[0],content=row.lastElementChild,star=row.querySelector('.flagParent').getBoundingClientRect(),attachment=row.querySelector('.attachmentParent').getBoundingClientRect(),subject=row.querySelector('.subjectParent').getBoundingClientRect();
 return getComputedStyle(content).display==='grid'&&attachment.left>=star.right&&attachment.left>=subject.right&&attachment.width>=24;
}));
check('Read dot and checkbox have distinct, aligned targets',await p.evaluate(()=>{
 const row=demoRows[0],dot=row.querySelector('.pw-read-toggle').getBoundingClientRect(),box=row.querySelector('.messageCheckbox').getBoundingClientRect();
 return dot.right<=box.left&&Math.abs(dot.y+dot.height/2-(box.y+box.height/2))<8;
}));
await p.locator('.messageListItem .pw-read-toggle').first().click();
await p.waitForFunction(()=>demoRows[0].querySelector('.pw-read-toggle').dataset.unread==='0');
check('Click marks only this message read through the native action without opening it',await p.evaluate(()=>fixtureSeenActions.length===1&&fixtureSeenActions[0].action===0&&fixtureSeenActions[0].uids.join(',')==='1'&&!demoRows[0].classList.contains('unseen')&&fixtureRowClicks===0));
await p.locator('.messageListItem .pw-read-toggle').first().press('Space');
await p.waitForFunction(()=>demoRows[0].querySelector('.pw-read-toggle').dataset.unread==='1');
check('Keyboard Space restores unread through the native action',await p.evaluate(()=>fixtureSeenActions.length===2&&fixtureSeenActions[1].action===1&&demoRows[0].classList.contains('unseen')&&fixtureRowClicks===0));
await p.locator('.messageListItem').last().hover();
await p.waitForFunction(()=>getComputedStyle(demoRows[9].querySelector('.flagParent')).opacity==='1');
check('Unflagged star appears on hover',await p.evaluate(()=>getComputedStyle(demoRows[9].querySelector('.flagParent')).opacity==='1'));
await p.setViewportSize({width:390,height:844});
await p.waitForFunction(()=>document.querySelectorAll('.pw-read-toggle').length===0);
check('Mobile keeps its existing visible star and does not gain the desktop dot',await p.evaluate(()=>{
 const stars=[...document.querySelectorAll('.messageListItem .flagParent')];return !document.querySelector('.pw-read-toggle')&&stars.every(star=>getComputedStyle(star).opacity==='1'&&star.getBoundingClientRect().width>=44);
}));
check('No runtime errors',await p.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:results.length,results},null,2));
