const page=await browser.getPage('reader-tags-1718');
page.setDefaultTimeout(6000);
await page.setViewportSize({width:1440,height:900});
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=reader',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>!!document.querySelector('.pw-reader-tags'));
await page.evaluate(()=>document.querySelector('#V-PopupsCompose').close());
const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
check('The native menu sits between info and star with no label row',await page.evaluate(()=>{
 const row=document.querySelector('.messageTags'),group=document.querySelector('.pw-reader-tags');
 const info=document.querySelector('.pw-message-details .infoParent').getBoundingClientRect();
 const icon=group.getBoundingClientRect(),star=document.querySelector('.pw-message-details .flagParent').getBoundingClientRect();
 return getComputedStyle(row).display==='none' && icon.x>info.x && icon.right<=star.x
  && icon.width>=43.9 && icon.height>=43.9 && group.querySelector('#tags-dropdown-id').getAttribute('aria-label')==='Étiquettes du message';
}));
await page.locator('#tags-dropdown-id').click();
check('The original menu opens under the new icon',await page.evaluate(()=>{
 const group=document.querySelector('.pw-reader-tags'),menu=group.querySelector('.dropdown-menu');
 const rect=menu.getBoundingClientRect();
 return group.classList.contains('show') && rect.width>0 && rect.height>0;
}));
await page.locator('.pw-reader-tags .dropdown-menu a').click();
check('The bound label action still responds',await page.evaluate(()=>fixtureLabelActions.length===1 && fixtureLabelActions[0]==='Projet'));
await page.locator('#tags-dropdown-id').press('Space');
check('Space opens the icon menu',await page.evaluate(()=>document.querySelector('.pw-reader-tags').classList.contains('show')));
await page.evaluate(()=>document.documentElement.classList.remove('pw-theme'));
await page.waitForFunction(()=>!document.querySelector('.pw-message-details .pw-reader-tags'));
check('Leaving Pied Web restores the original control and row',await page.evaluate(()=>{
 const row=document.querySelector('.messageTags');return row.querySelector('.btn-group') && getComputedStyle(row).display!=='none';
}));
await page.evaluate(()=>document.documentElement.classList.add('pw-theme'));
await page.waitForFunction(()=>!!document.querySelector('.pw-message-details .pw-reader-tags'));
check('Returning to Pied Web moves the same control again',await page.evaluate(()=>document.querySelectorAll('#tags-dropdown-id').length===1));
await page.evaluate(()=>{
 const row=document.querySelector('.messageTags');
 const replacement=row.cloneNode(true);
 const freshGroup=document.querySelector('.pw-reader-tags').cloneNode(true);
 freshGroup.classList.remove('pw-reader-tags','show');freshGroup.querySelector('.dropdown-menu').classList.remove('show');replacement.append(freshGroup);
 bindFixtureTagMenu(replacement.querySelector('.btn-group'));
 row.replaceWith(replacement);
});
await page.waitForFunction(()=>document.querySelector('.messageTags.pw-tags-in-header')?.querySelector('.btn-group')===null);
check('A rebuilt native label row replaces the old trigger',await page.evaluate(()=>document.querySelectorAll('#tags-dropdown-id').length===1 && document.querySelector('.pw-reader-tags').closest('.pw-message-details')));
await page.setViewportSize({width:390,height:844});
check('Mobile has one reachable icon and no horizontal overflow',await page.evaluate(()=>{
 const icon=document.querySelector('#tags-dropdown-id').getBoundingClientRect();
 return icon.width>=43.9 && icon.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth;
}));
await page.locator('#tags-dropdown-id').click();
check('Mobile label menu stays within the viewport',await page.evaluate(()=>{
 const menu=document.querySelector('.pw-reader-tags .dropdown-menu').getBoundingClientRect();
 return menu.width>0 && menu.left>=0 && menu.right<=innerWidth;
}));
await page.emulateMedia({colorScheme:'dark'});
await page.evaluate(()=>document.documentElement.dataset.themes='dark');
check('Dark theme retains a visible focus target',await page.evaluate(()=>{
 const icon=document.querySelector('#tags-dropdown-id');icon.focus();
 return document.activeElement===icon && getComputedStyle(icon).color!=='rgba(0, 0, 0, 0)';
}));
await page.evaluate(()=>document.querySelector('.messageTags').remove());
await page.waitForFunction(()=>!document.querySelector('#tags-dropdown-id'));
check('No icon remains when native labels are unavailable',await page.evaluate(()=>!document.querySelector('.pw-reader-tags')));
check('No fixture runtime errors',await page.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:checks.length,checks}));
