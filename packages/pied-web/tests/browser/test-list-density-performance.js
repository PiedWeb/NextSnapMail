// Scan real row content without shrinking type; retain native actions and scope.
const page=await browser.getPage('nextsnapmail-list-density-performance');
page.setDefaultTimeout(7000);
await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();});
const checks=[],measurements=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log('PASS '+name);};
for(const dark of [false,true])for(const width of [1536,1000,390,320]) {
 await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:dark?'dark':'light'});
 await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=1&feedDefault=inbox'+(dark?'&dark=1':''));
 await page.waitForFunction(()=>PiedWebUx.feed.mode()==='inbox'&&document.querySelectorAll('.pw-day-label').length);
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(resolve));});
 const result=await page.evaluate(()=>{
  const rows=[...document.querySelectorAll('.messageListItem')];
  const list=document.querySelector('.messageList').getBoundingClientRect();
  return {width:innerWidth,list:list.width,heights:rows.map(row=>row.getBoundingClientRect().height),
   fonts:rows.map(row=>parseFloat(getComputedStyle(row.querySelector('.subjectParent')).fontSize)),
   visible:rows.filter(row=>{const r=row.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}).length,
   overflow:document.documentElement.scrollWidth>innerWidth,
   timeVisible:rows.every(row=>!!row.querySelector('time').getClientRects().length),
   rowClipped:rows.some(row=>{const box=row.getBoundingClientRect(),subject=row.querySelector('.subjectParent').getBoundingClientRect();return subject.bottom>box.bottom||subject.left<box.left||subject.right>box.right;})};
 });
 measurements.push(result);
 check(`Readable dates and subjects stay inside the list at ${width}px (${dark?'dark':'light'})`,
  !result.overflow&&!result.rowClipped&&result.timeVisible&&result.fonts.every(size=>size>=14));
 if(width>=1200)check('The default desktop working list shows ten rows with space left for reading',
  result.visible>=10&&result.list<=480&&result.heights.every(height=>height>=56&&height<=64));
 if(width===390)check('A phone shows ten rows while allowing long subjects two lines',
  result.visible>=10&&Math.max(...result.heights)>Math.min(...result.heights));
 await page.locator('.messageListItem .subjectParent').first().click({modifiers:['Control']});
 check('Denser geometry keeps native selection and exact message identity',await page.evaluate(()=>
  demoMessages[0].checked()&&demoMessages.slice(1).every(message=>!message.checked())));
 await page.keyboard.press('Escape');
}
await page.setViewportSize({width:1536,height:844});
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=2&feedDefault=inbox');
await page.waitForFunction(()=>PiedWebUx.feed.mode()==='inbox');
await page.evaluate(()=>document.querySelector('.pw-global-nav a').click());
await page.waitForFunction(()=>document.querySelectorAll('.pw-global-row').length===5);
await page.waitForTimeout(80);
check('One navigation starts one global scan, including the initial load',await page.evaluate(()=>
 feedRequests.filter(request=>request.operation==='global').length===1));
await page.evaluate(()=>dispatchEvent(new Event('pw-mailbox-changed')));
await page.waitForFunction(()=>feedRequests.filter(request=>request.operation==='global').length===2);
check('Confirmed mailbox changes still request fresh data',true);
await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&shell=1&listOnly=1&accounts=1&feedDefault=inbox');
await page.waitForSelector('.pw-day-label');
await page.evaluate(()=>{
 const container=document.querySelector('.messageList > .b-content'),rows=[...document.querySelectorAll('.messageListItem')];
 window.benchmarkRows=new Map(rows.map((row,i)=>[row,demoMessages[i]]));
 for(let i=rows.length;i<500;i++){
  const row=rows[i%rows.length].cloneNode(true);container.append(row);rows.push(row);
  benchmarkRows.set(row,Object.create(demoMessages[i%demoMessages.length]));
 }
 const original=ko.dataFor;
 ko.dataFor=node=>{if(benchmarkRows.has(node)){window.groupLookups++;return benchmarkRows.get(node);}return original(node);};
 window.groupLookups=0;
 window.benchmarkGroups=[...benchmarkRows.values()].filter((_,i)=>i%5===0).map((message,i)=>({label:'Jour '+i,messages:[message]}));
});
await page.waitForTimeout(80);
const grouped=await page.evaluate(async()=>{
 groupLookups=0;const start=performance.now();listVM.groupedList(benchmarkGroups);
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 return {rows:benchmarkRows.size,groups:benchmarkGroups.length,lookups:groupLookups,ms:performance.now()-start,headings:document.querySelectorAll('.pw-day-label').length};
});
console.log(JSON.stringify({groupingBenchmark:grouped}));
check('Date grouping and row presentation keep identity lookups proportional to 500 loaded rows',grouped.headings===100&&grouped.lookups<=3000);
await page.evaluate(()=>{window.keptHeading=document.querySelector('.pw-day-label');document.documentElement.classList.add('fixture-grouping-check');});
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
check('Unchanged groups keep their existing heading DOM during presentation updates',await page.evaluate(()=>
 document.querySelector('.pw-day-label')===keptHeading));
console.log(JSON.stringify({passed:checks.length,checks,measurements,grouped},null,2));
