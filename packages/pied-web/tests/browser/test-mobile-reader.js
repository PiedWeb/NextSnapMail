// Both native mail views remain mounted. Only message-selected switches panes;
// hiding the list in the fixture would conceal a theme specificity regression.
const page = await browser.getPage('mail-mobile-reader-regression');
page.setDefaultTimeout(7000);
const base = 'http://127.0.0.1:8876/.local-work/images-native-preview.html?mode=list&shell=1&listOnly=1&accounts=1';
let passed = 0;
const check = (name, ok) => {
    if (!ok) throw new Error(name);
    passed++; console.log('PASS ' + name);
};
for (const theme of ['light', 'dark']) {
    await page.emulateMedia({colorScheme:theme});
    for (const width of [320, 390, 799]) {
        await page.setViewportSize({width,height:844});
        await page.goto(base);
        await page.waitForSelector('.pw-mobile-header');
        await page.evaluate(async () => {
            const core = await (await fetch('/app/snappymail/v/2.38.2/static/js/app.js')).text();
            const nativeSelection = core.match(/elementById\('rl-right'\)\.classList\.toggle\('message-selected', !!message\);/);
            if (!nativeSelection) throw new Error('Review current native MessageUserStore selection contract');
            const select = new Function('elementById', 'message', nativeSelection[0]);
            readerVM.message.subscribe(message => select(id => document.getElementById(id), message));
            window.readerFixtureMessage = readerVM.message();
            readerVM.closeMessage = () => readerVM.message(null);
            readerVM.message(null);
            document.documentElement.classList.remove('sm-msgView-side', 'sm-msgView-bottom');
            document.getElementById('V-MailMessageList').hidden = false;
            document.getElementById('V-MailMessageView').hidden = false;
        });
        const label = theme + ' ' + width;
        check(label + ': list alone fills the phone before opening a message', await page.evaluate(() => {
            const list = document.getElementById('V-MailMessageList'), reader = document.getElementById('V-MailMessageView');
            return list.getBoundingClientRect().width >= innerWidth - 1 && list.getBoundingClientRect().height >= innerHeight - 100
                && getComputedStyle(reader).display === 'none' && !list.hidden && !reader.hidden;
        }));
        await page.evaluate(() => readerVM.message(readerFixtureMessage));
        check(label + ': opening gives the entire content area to the reader', await page.evaluate(() => {
            const list = document.getElementById('V-MailMessageList'), reader = document.getElementById('V-MailMessageView');
            const bounds = reader.getBoundingClientRect(), header = document.querySelector('.pw-mobile-header').getBoundingClientRect();
            return getComputedStyle(list).display === 'none' && bounds.width >= innerWidth - 1
                && bounds.height >= innerHeight - header.height - 2 && bounds.bottom <= innerHeight + 1;
        }));
        check(label + ': message text is visible and can scroll to its end', await page.evaluate(() => {
            const scroller = document.querySelector('.messageView'), text = document.querySelector('.bodyText');
            const bounds = scroller.getBoundingClientRect();
            const visible = text.getBoundingClientRect().top < bounds.bottom - 100;
            scroller.scrollTop = scroller.scrollHeight;
            const end = text.getBoundingClientRect().bottom <= bounds.bottom + 1;
            scroller.scrollTop = 0;
            return visible && end && document.documentElement.scrollWidth <= innerWidth;
        }));
        if (width === 390) {
            await page.evaluate(() => document.documentElement.style.fontSize = '200%');
            check(label + ': larger text keeps one full-width reader with a scrollable message', await page.evaluate(() => {
                const reader = document.getElementById('V-MailMessageView'), scroller = reader.querySelector('.messageView');
                const bounds = reader.getBoundingClientRect();
                return bounds.width >= innerWidth - 1 && bounds.bottom <= innerHeight + 1
                    && getComputedStyle(document.getElementById('V-MailMessageList')).display === 'none'
                    && scroller.clientHeight > 100 && scroller.scrollHeight > scroller.clientHeight;
            }));
            await page.evaluate(() => document.documentElement.style.fontSize = '');
        }
        await page.locator('.pw-mobile-header > .btn[data-pw-icon=previous]').click();
        check(label + ': Back restores the full list and hides the reader', await page.evaluate(() =>
            !document.getElementById('rl-right').classList.contains('message-selected')
            && getComputedStyle(document.getElementById('V-MailMessageView')).display === 'none'
            && document.getElementById('V-MailMessageList').getBoundingClientRect().height >= innerHeight - 100));
    }
}
await page.setViewportSize({width:1440,height:900});
await page.goto(base);
await page.waitForSelector('.pw-mobile-header', {state:'attached'});
await page.evaluate(() => {
    document.getElementById('V-MailMessageView').hidden = false;
    document.getElementById('rl-right').classList.add('message-selected');
});
check('Desktop without preview also replaces the list when reading', await page.evaluate(() =>
    getComputedStyle(document.getElementById('V-MailMessageList')).display === 'none'
    && document.getElementById('V-MailMessageView').getBoundingClientRect().width >= document.getElementById('rl-right').clientWidth - 1));
await page.goto(base + '&side=1');
await page.waitForSelector('.pw-mobile-header', {state:'attached'});
await page.evaluate(() => {
    document.getElementById('V-MailMessageView').hidden = false;
    document.getElementById('rl-right').classList.add('message-selected');
});
check('Desktop side preview retains both list and reader', await page.evaluate(() =>
    document.getElementById('V-MailMessageList').getBoundingClientRect().width >= 320
    && document.getElementById('V-MailMessageView').getBoundingClientRect().width >= 320));
await page.setViewportSize({width:390,height:844});
check('Shrinking an open desktop preview gives the phone one reader', await page.evaluate(() =>
    getComputedStyle(document.getElementById('V-MailMessageList')).display === 'none'
    && document.getElementById('V-MailMessageView').getBoundingClientRect().width >= innerWidth - 1));
console.log(JSON.stringify({passed}));
