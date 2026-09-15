const page = await browser.getPage('nextsnapmail-left-panel');
page.setDefaultTimeout(6000);
const checks = [];
const check = (name, ok) => {
    if (!ok) throw new Error(name);
    checks.push(name);
    console.log('PASS ' + name);
};
const url = 'http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&listOnly=1&panel=1';
const stored = () => page.evaluate(() => localStorage.getItem('pw-left-panel'));
const collapsed = () => page.evaluate(() => document.documentElement.classList.contains('rl-left-panel-disabled'));
const rail = () => page.evaluate(() => document.getElementById('rl-left').getBoundingClientRect().width);
const settle = () => new Promise(resolve => setTimeout(resolve, 80));

await page.emulateMedia({colorScheme: 'light'});
await page.setViewportSize({width: 1200, height: 800});
await page.goto(url);
await page.evaluate(() => localStorage.removeItem('pw-left-panel'));
await page.reload();
check('Desktop starts expanded when nothing was chosen', !await collapsed() && null === await stored() && await rail() > 72);

await page.locator('#V-MailFolderList .toggleLeft').click();
check('Collapsing the panel stores the choice', await collapsed() && '1' === await stored());
await page.reload();
check('Reload restores the compact rail', await collapsed());
check('The restored rail keeps its 72px width', Math.abs(await rail() - 72) < 1);

await page.locator('#V-MailFolderList .toggleLeft').click();
check('Expanding stores the opposite choice', !await collapsed() && '0' === await stored());
await page.reload();
check('Reload keeps the expanded panel', !await collapsed() && await rail() > 72);

await page.evaluate(() => localStorage.setItem('pw-left-panel', '1'));
await page.setViewportSize({width: 390, height: 844});
await page.goto(url);
check('Mobile keeps the native closed drawer instead of the desktop choice', await collapsed());
// The drawer toggle is the same native control; on mobile it opens the folder list.
await page.evaluate(() => document.querySelector('#V-MailFolderList .toggleLeft').click());
await settle();
check('Opening the mobile drawer leaves the desktop choice untouched', !await collapsed() && '1' === await stored());

await page.setViewportSize({width: 1200, height: 800});
await page.waitForFunction(() => document.documentElement.classList.contains('rl-left-panel-disabled'));
check('Returning to the desktop breakpoint restores the compact rail', Math.abs(await rail() - 72) < 1 && '1' === await stored());

// The application opens the panel by itself while a message is dragged over the folders.
await page.evaluate(() => document.documentElement.classList.remove('rl-left-panel-disabled'));
await settle();
check('An application-driven expansion is neither stored nor undone', !await collapsed() && '1' === await stored());

await page.evaluate(() => localStorage.removeItem('pw-left-panel'));
await page.goto(url);
check('A cleared choice falls back to the native default', !await collapsed());
console.log(JSON.stringify({passed: checks.length, checks}));
