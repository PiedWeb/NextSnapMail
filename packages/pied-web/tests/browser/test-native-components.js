// Native templates, real binding accessors, fictional transport and identities.
const p=await browser.getPage('pied-web-native-components');p.setDefaultTimeout(5000);
await p.goto('http://127.0.0.1:8876/.local-work/native-components-fixture.html');
await p.evaluate(()=>fixtureReady);
const checks=[];
const check=(label,ok)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS '+label);};
const render=name=>p.evaluate(name=>fixtureRender('User/'+name),name);
const metrics=()=>p.evaluate(()=>{
 document.querySelectorAll('*').forEach(e=>getComputedStyle(e).backgroundColor);
 document.getAnimations().forEach(a=>{if(a.effect?.getTiming().iterations!==Infinity)try{a.finish()}catch{}});
 const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none';
 const fields=[...fixtureRoot.querySelectorAll('input:not([type=hidden]),select,textarea,.select')].filter(visible);
 const named=e=>e.labels?.length||e.getAttribute('aria-label')||e.getAttribute('aria-labelledby');
 const controls=fields.filter(e=>!e.matches('[type=checkbox],[type=radio]'));
 const ctx=document.createElement('canvas').getContext('2d');
 const lum=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);};
 const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const notification=fixtureRoot.querySelector('[data-i18n="SETTINGS_GENERAL/CHROME_NOTIFICATION_DESC_DENIED"]');
 return {fields:fields.length,unnamed:fields.filter(e=>!named(e)).map(e=>e.tagName+'.'+e.className),
  focus:controls.map(e=>{e.focus();e.getAnimations().forEach(a=>{try{a.finish()}catch{}});const style=getComputedStyle(e),data={border:style.borderWidth,outline:style.outlineStyle,contrast:contrast(style.borderTopColor,getComputedStyle(document.documentElement).getPropertyValue('--nc-color-main-background'))};e.blur();return data;}),
  borders:controls.map(e=>getComputedStyle(e).borderWidth),font:controls.map(e=>getComputedStyle(e).fontSize),
  overflow:fixtureRoot.scrollWidth>fixtureRoot.clientWidth+1,
  paneOverflow:document.getElementById('V-SettingsPane')?.scrollWidth>innerWidth,
  notification:notification?contrast(getComputedStyle(notification).color,getComputedStyle(document.documentElement).getPropertyValue('--nc-color-main-background')):null};
});
for(const scheme of ['light','dark']){
 await p.emulateMedia({colorScheme:scheme});await p.evaluate(s=>document.documentElement.dataset.themes=s,scheme);
 for(const width of [1440,390,320]){
  await p.setViewportSize({width,height:950});
  for(const name of ['SettingsGeneral','SettingsSecurity','PopupsFolderCreate','PopupsAdvancedSearch']){
   await render(name);const data=await metrics();
   check(`${name} ${scheme} ${width}: every visible field has a name`,data.fields>0&&!data.unnamed.length);
   check(`${name} ${scheme} ${width}: controls keep one border`,data.borders.every(x=>x==='1px'));
   check(`${name} ${scheme} ${width}: focus strengthens the same one-pixel boundary`,data.focus.every(x=>x.border==='1px'&&x.outline==='none'&&x.contrast>=3));
   check(`${name} ${scheme} ${width}: form stays inside its panel`,!data.overflow&&!data.paneOverflow);
   if(name==='SettingsGeneral')check(`Notification ${scheme} ${width}: secondary text remains readable`,data.notification>=4.5);
   if(width<800)check(`${name} ${scheme} ${width}: input type avoids automatic phone zoom`,data.font.every(x=>x==='16px'));
   if(name.startsWith('Popups'))check(`${name} ${scheme} ${width}: close has a 44px target and native popup uses one elevation`,await p.evaluate(()=>{
    const close=fixtureRoot.querySelector('.close'),r=close.getBoundingClientRect(),s=getComputedStyle(fixtureRoot);
    return r.width>=44&&r.height>=44&&close.getAttribute('aria-label')&&s.filter==='none'&&s.borderWidth==='0px'&&s.boxShadow!=='none';
   }));
  }
 }
}
for(const scheme of ['light','dark']){
 await p.emulateMedia({colorScheme:scheme});await p.evaluate(s=>document.documentElement.dataset.themes=s,scheme);
 await p.setViewportSize({width:320,height:950});await render('SettingsAccounts');
 check(`Accounts ${scheme} 320: the native principal colspan keeps names inside the table`,!(await metrics()).overflow);
 check(`Accounts ${scheme} 320: the drag column preserves room for the account name`,await p.evaluate(()=>{
  const row=fixtureRoot.querySelector('.accounts-list tr[draggable=true]');
  return row.cells[0].getBoundingClientRect().width===44&&row.cells[1].getBoundingClientRect().width>=140;
 }));
}
await p.setViewportSize({width:390,height:950});await render('SettingsAccounts');
await p.waitForSelector('.accounts-list .e-action[role=button]');
check('Long account names wrap without an internal table overflow',!(await metrics()).overflow);
await p.locator('.accounts-list .e-action').first().press('Enter');
check('Enter invokes the original delegated edit action once',await p.evaluate(()=>fixtureCalls.edit===1));
await p.locator('.accounts-list .delete').first().press('Space');
check('Space only asks for deletion, it does not confirm it',await p.evaluate(()=>fixtureVM.accounts()[1].askDelete()&&fixtureCalls.delete===0));
await p.locator('.accounts-list .button-confirm-delete.delete-access').press('Enter');
check('The explicit confirmation retains the native command',await p.evaluate(()=>fixtureCalls.delete===1));
await p.locator('.accounts-list tr[draggable=true] .drag-handle').first().press('Alt+ArrowDown');
check('Alt+Down reorders the bound account list through its native persistence callback',await p.evaluate(()=>fixtureVM.accounts()[2].displayName().startsWith('Compte de démonstration')&&fixtureCalls.sort===1));
await p.locator('.accounts-list tr[draggable=true] .drag-handle').first().press('Alt+ArrowUp');
check('Keyboard sorting cannot move an account before the principal account',await p.evaluate(()=>fixtureVM.accounts()[0].isAdditional()===false&&fixtureCalls.sort===1));
await render('SettingsGeneral');
await p.evaluate(()=>{
 const group=document.createElement('div');group.className='control-group';group.innerHTML='<label>Champ monté tardivement</label><div class="e-component"><select><option>Exemple</option></select></div>';fixtureRoot.append(group);
});
await p.waitForSelector('#V-Settings-General > .control-group:last-child select[id]');
check('Late native components receive their label association',await p.evaluate(()=>fixtureRoot.querySelector(':scope > .control-group:last-child select').labels.length===1));
await p.evaluate(()=>{const status=document.createElement('span');status.className='settings-save-trigger';fixtureRoot.append(status);});
await p.waitForSelector('.settings-save-trigger[role=status]',{state:'attached'});
await p.evaluate(()=>fixtureRoot.querySelector('.settings-save-trigger').classList.add('error'));
await p.waitForFunction(()=>document.querySelector('.settings-save-trigger .pw-native-status-text').textContent.length>0);
check('A failed native save produces text in a polite live region',await p.evaluate(()=>fixtureRoot.querySelector('.settings-save-trigger').getAttribute('aria-live')==='polite'&&fixtureRoot.querySelector('.pw-native-status-text').textContent.includes('Échec')));
await render('PopupsAdvancedSearch');
await p.evaluate(()=>{const group=document.createElement('div');group.className='control-group pw-search-scope-field';group.innerHTML='<label for="fixture-scope">Portée de la recherche</label><select id="fixture-scope"><option>Tous les dossiers du compte</option></select>';fixtureRoot.querySelector('form > div').prepend(group);});
check('Mobile advanced search gives its scope a readable full row',await p.evaluate(()=>{const field=fixtureRoot.querySelector('.pw-search-scope-field'),select=field.querySelector('select');return select.getBoundingClientRect().width>=field.getBoundingClientRect().width-1&&select.getBoundingClientRect().width>=200;}));
await render('PopupsContacts');
check('Conditional contact rows also obey the one-pixel rule',await p.evaluate(()=>[...fixtureRoot.querySelectorAll('.e-contact-item')].every(e=>getComputedStyle(e).borderLeftWidth==='1px')));
console.log(JSON.stringify({passed:checks.length,checks}));
