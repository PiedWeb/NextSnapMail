const page = await browser.getPage('nextsnapmail-folder-rail');
page.setDefaultTimeout(7000);
const checks = [];
const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); console.log('PASS ' + name); };
const url = 'http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&side=1&listOnly=1&compact=1&accounts=2';
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
const labels = () => page.evaluate(() => [...document.querySelectorAll('.pw-folder-rail-item')].map(item => item.querySelector('button').dataset.pwLabel));

await page.emulateMedia({colorScheme:'light'});
await page.setViewportSize({width:1200,height:800});
await page.goto(url);
await page.evaluate(() => {
    Object.keys(localStorage).filter(key => key.startsWith('pw-folder-order:') || key === 'fixture-folder-order-server').forEach(key => localStorage.removeItem(key));
});
await page.reload();
await page.waitForSelector('.pw-folder-rail-button');
check('The compact panel uses one ordered rail while native Knockout lists stay mounted', await page.evaluate(() => {
    const rail = document.querySelector('.pw-folder-rail'), native = document.querySelector('.b-folders-system');
    return getComputedStyle(rail).display === 'flex' && getComputedStyle(native).display === 'none' && native.isConnected;
}));
check('Custom folders receive readable, distinct monograms', await page.evaluate(() => {
    const entries = [...document.querySelectorAll('.pw-folder-rail-button.pw-folder-custom')];
    const marks = entries.map(button => button.querySelector('.pw-folder-rail-monogram').textContent);
    return entries.length >= 3 && marks.includes('MT') && marks.includes('SP') && marks.includes('PR') && new Set(marks).size === marks.length;
}));
check('Unread counts and accessible names are mirrored from native folders', await page.evaluate(() => {
    const spam = [...document.querySelectorAll('.pw-folder-rail-button')].find(button => button.dataset.pwLabel === 'spam');
    return spam?.querySelector('.pw-folder-rail-count').textContent === '215' && /spam.*215 non lus/i.test(spam.getAttribute('aria-label'));
}));

const project = page.locator('.pw-folder-rail-button').filter({hasText:'PR'}).first();
await project.focus(); await page.waitForSelector('.pw-folder-rail-tooltip:not([hidden])');
check('Keyboard focus reveals the full folder label and reorder hint', await page.evaluate(() => {
    const tip = document.querySelector('.pw-folder-rail-tooltip');
    return /Projets/.test(tip.textContent) && /réorganiser/.test(tip.textContent);
}));

await page.evaluate(() => {
    window.fixtureFolderClicks = [];
    document.querySelectorAll('.b-folders-user a.selectable').forEach(link => link.addEventListener('click', () => fixtureFolderClicks.push(link.textContent.trim())));
});
const custom = page.locator('.pw-folder-rail-button').filter({hasText:'MT'}).first();
await custom.click();
check('A short click still activates the untouched native folder link', await page.evaluate(() => fixtureFolderClicks.includes('Mail type')));

const before = await labels();
const box = await custom.boundingBox();
const firstBox = await page.locator('.pw-folder-rail-button').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await settle(520);
check('Holding an icon enters an explicit reorder state', await page.evaluate(() => !!document.querySelector('.pw-folder-rail-button.pw-dragging')));
await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + 4, {steps:5});
await page.mouse.up(); await settle(100);
const after = await labels();
check('Long-click drag can move a custom folder across system mailboxes', before[0] !== 'Mail type' && after[0] === 'Mail type');
check('The new order is sent to account-scoped persistence', await page.evaluate(() => folderOrderRequests.some(request => Object.hasOwn(request, 'order'))));

await page.reload(); await page.waitForSelector('.pw-folder-rail-button'); await settle(80);
check('Reload restores the persisted order before use', (await labels())[0] === 'Mail type');

const inbox = page.locator('.pw-folder-rail-button').filter({hasText:''}).nth(2);
const keyboardBefore = await labels();
await page.locator('.pw-folder-rail-button').first().focus();
await page.keyboard.press('Alt+ArrowDown'); await settle(80);
const keyboardAfter = await labels();
check('Alt plus an arrow provides the keyboard reorder path', keyboardAfter[1] === keyboardBefore[0] && keyboardAfter[0] === keyboardBefore[1]);

await page.evaluate(() => {
    const source = [...document.querySelectorAll('.b-folders-system a.selectable')].find(link => link.textContent.includes('Brouillons'));
    source.dataset.unread = '9'; source.classList.add('selected');
});
await page.waitForFunction(() => [...document.querySelectorAll('.pw-folder-rail-button')].some(button => button.dataset.pwLabel === 'Brouillons' && button.classList.contains('selected') && button.querySelector('.pw-folder-rail-count').textContent === '9'));
check('Native selected and unread changes stay synchronized', true);

await page.evaluate(() => document.documentElement.classList.remove('rl-left-panel-disabled'));
check('Expanding restores the complete native hierarchy', await page.evaluate(() => getComputedStyle(document.querySelector('.b-folders-system')).display !== 'none' && getComputedStyle(document.querySelector('.pw-folder-rail')).display === 'none'));
console.log(JSON.stringify({passed:checks.length,checks}));
