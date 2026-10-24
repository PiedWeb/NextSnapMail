// Current native popup, fictional transport. One selector owns all four scopes.
const page=await browser.getPage('nextsnapmail-search-scope');
page.setDefaultTimeout(7000);
await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();});
const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
for(const dark of [false,true]) {
 await page.setViewportSize({width:1440,height:900});
 await page.emulateMedia({colorScheme:dark?'dark':'light'});
 await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=2&feedDefault=inbox'+(dark?'&dark=1':''));
 await page.waitForFunction(()=>PiedWebUx.feed.mode()==='inbox');
 await page.evaluate(async()=>{
  const popup=document.createElement('dialog');popup.id='V-PopupsAdvancedSearch';
  popup.innerHTML=await(await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsAdvancedSearch.html')).text();
  document.querySelector('#rl-app').append(popup);
  window.scopeVM={viewModelTemplateID:'PopupsAdvancedSearch',viewModelDom:popup,selectedTreeValue:ko.observable('')};
  dispatchEvent(new CustomEvent('rl-view-model',{detail:scopeVM}));
  popup.querySelector('form').addEventListener('submit',event=>{
   event.preventDefault();
   const query=(scopeVM.selectedTreeValue()?'in:'+scopeVM.selectedTreeValue()+' ':'')+'subject:scope-probe';
   if(!rl.mailUi.onSearch(query))messageList.mainSearch(query);
   popup.close();
  });
  popup.classList.add('animate');popup.showModal();
 });
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:900});
  check(`One labelled scope fits ${width}px (${dark?'dark':'light'})`,await page.evaluate(()=>{
   const select=document.querySelector('#pw-search-scope'),box=select.getBoundingClientRect();
   return select.options.length===4&&box.width>0&&box.left>=0&&box.right<=innerWidth
    &&document.querySelector('.pw-native-search-scope').getClientRects().length===0
    &&document.documentElement.scrollWidth<=innerWidth;
  }));
 }
 const selector=page.locator('#pw-search-scope');
 await page.evaluate(()=>{scopeVM.selectedTreeValue('all');const popup=document.querySelector('#V-PopupsAdvancedSearch');popup.close();popup.showModal();});
 await page.waitForFunction(()=>document.querySelector('#pw-search-scope').value==='account');
 check('An existing native all-folder criterion is reflected in the one selector',true);
 await page.evaluate(()=>{scopeVM.selectedTreeValue('');const popup=document.querySelector('#V-PopupsAdvancedSearch');popup.close();popup.showModal();});
 await page.waitForFunction(()=>document.querySelector('#pw-search-scope').value==='folder');
 await selector.selectOption('global');
 await page.evaluate(()=>document.querySelector('#V-PopupsAdvancedSearch').close());
 await page.locator('.pw-search-toggle').click();
 await page.evaluate(()=>document.querySelector('#V-PopupsAdvancedSearch').showModal());
 await page.waitForFunction(()=>document.querySelector('#pw-search-scope').value==='folder');
 check('Cancel keeps the previous scope and issues no search',await page.evaluate(()=>
  scopeVM.selectedTreeValue()===''&&!mailboxFixtureCalls.some(call=>call.operation==='search')));
 for(const scope of ['folder','subtree','account','global']) {
  await selector.selectOption(scope);
  await page.evaluate(()=>scopeVM.selectedTreeValue('all'));
  await page.locator('#V-PopupsAdvancedSearch button[form="advancedsearchform"]').click();
  check(`Submitting ${scope} sets one effective scope`,await page.evaluate(scope=>scopeVM.selectedTreeValue()===(scope==='subtree'?'subtree':''),scope));
  if(scope==='folder'||scope==='subtree')check(`${scope} search keeps the native fast path`,await page.evaluate(scope=>
   actionCalls.includes('search:'+(scope==='subtree'?'in:subtree ':'')+'subject:scope-probe')
   &&!mailboxFixtureCalls.some(call=>call.operation==='search'),scope));
  else {
   await page.waitForFunction(()=>document.querySelector('.pw-global-rows').getAttribute('aria-busy')==='false');
   check(`${scope} targets the chosen folders/accounts and states that scope`,await page.evaluate(scope=>{
    const call=mailboxFixtureCalls.filter(call=>call.operation==='search').at(-1);
    return call.scope===(scope==='subtree'?'subtree':'all')&&call.folder==='INBOX'
     &&(scope==='global'?!Object.hasOwn(call,'accountHashes'):call.accountHashes===JSON.stringify(['a'.repeat(40)]))
     &&document.querySelector('.pw-list-scope-context').textContent.startsWith('Recherche :');
   },scope));
  }
  await page.evaluate(()=>document.querySelector('#V-PopupsAdvancedSearch').showModal());
 }
 await page.evaluate(()=>PiedWebUx.feed.setMode('global'));
 await selector.selectOption('subtree');
 await page.locator('#V-PopupsAdvancedSearch button[form="advancedsearchform"]').click();
 await page.waitForFunction(()=>document.querySelector('.pw-global-rows').getAttribute('aria-busy')==='false');
 check('A subtree in the global view keeps exact account/folder identities without a competing native criterion',await page.evaluate(()=>{
  const call=mailboxFixtureCalls.filter(call=>call.operation==='search').at(-1);
  return call.scope==='subtree'&&call.folder==='INBOX'&&call.accountHashes===JSON.stringify(['a'.repeat(40)])
   &&scopeVM.selectedTreeValue()==='';
 }));
 await page.evaluate(()=>document.querySelector('#V-PopupsAdvancedSearch').showModal());
 await selector.selectOption('global');
 await page.locator('#V-PopupsAdvancedSearch button[form="advancedsearchform"]').click();
 await page.waitForFunction(()=>document.querySelector('.pw-global-rows').getAttribute('aria-busy')==='false');
 await page.evaluate(()=>document.querySelector('#V-PopupsAdvancedSearch').showModal());
 await selector.selectOption('account');
 await page.evaluate(()=>PiedWebUx.feed.setMode(PiedWebUx.feed.mode()));
 check('Presentation updates show the committed scope while another choice is only staged',await page.evaluate(()=>
  document.querySelector('.pw-list-scope-context').textContent==='Recherche : Tous mes comptes'));
 await page.evaluate(()=>document.querySelector('#V-PopupsAdvancedSearch').close());
 await page.evaluate(()=>{mailboxFixtureDelay=200;window.searchCallsBefore=mailboxFixtureCalls.filter(call=>call.operation==='search').length;});
 await page.locator('.inputSearch').fill('recherche-rapide');
 await page.locator('.inputSearch').press('Enter');await page.locator('.inputSearch').press('Enter');
 await page.waitForFunction(()=>document.querySelector('.pw-global-rows').getAttribute('aria-busy')==='false');
 check('Repeated Enter shares the same pending search instead of rescanning the mailboxes',await page.evaluate(()=>
  mailboxFixtureCalls.filter(call=>call.operation==='search').length===searchCallsBefore+1));
 await page.locator('.inputSearch').fill('autre-recherche');await page.locator('.inputSearch').press('Enter');
 await page.waitForFunction(()=>document.querySelector('.pw-global-rows').getAttribute('aria-busy')==='false');
 check('A different query still gets a fresh authoritative result',await page.evaluate(()=>
  mailboxFixtureCalls.filter(call=>call.operation==='search').at(-1).search==='autre-recherche'));
 await page.locator('.inputSearch').fill('ancienne-recherche');await page.locator('.inputSearch').press('Enter');
 await page.evaluate(()=>{PiedWebUx.feed.setMode('inbox');document.querySelector('#V-PopupsAdvancedSearch').showModal();});
 await selector.selectOption('folder');
 await page.locator('#V-PopupsAdvancedSearch button[form="advancedsearchform"]').click();
 await page.waitForTimeout(250);
 check('Returning to a native scope discards the older pending workspace result',await page.evaluate(()=>
  document.querySelector('.pw-global-feed').hidden&&!PiedWebUx.feed.isGlobal()
  &&actionCalls.at(-1)==='search:subject:scope-probe'));
 await page.evaluate(()=>{document.querySelector('#V-PopupsAdvancedSearch').showModal();document.documentElement.classList.remove('pw-theme');});
 check('Theme exit restores the native scope and hides the product scope',await page.evaluate(()=>
  !!document.querySelector('.pw-native-search-scope').getClientRects().length
  &&!document.querySelector('.pw-search-scope-field').getClientRects().length));
 check('No runtime errors',await page.evaluate(()=>fixtureErrors.length===0));
}
console.log(JSON.stringify({passed:checks.length,checks},null,2));
