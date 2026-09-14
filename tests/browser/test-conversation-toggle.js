const page = await browser.getPage('nextsnapmail-conversation-toggle');
page.setDefaultTimeout(6000);
const checks = [];
const check = (name, ok) => {
    if (!ok) throw new Error(name);
    checks.push(name);
    console.log('PASS ' + name);
};

for (const {enabled, width, scheme} of [
    {enabled: false, width: 1200, scheme: 'light'},
    {enabled: true, width: 1200, scheme: 'light'},
    {enabled: false, width: 390, scheme: 'light'},
    {enabled: true, width: 390, scheme: 'dark'},
]) {
    await page.setViewportSize({width, height: 844});
    await page.emulateMedia({colorScheme: scheme});
    await page.goto('http://127.0.0.1:8876/.local-work/images-native-preview.html?drafts=1&mode=list&side=1&shell=1&threads=' + Number(enabled));
    await page.waitForSelector('#V-MailMessageList button.pw-threads');
    const state = await page.evaluate(() => {
        const button = document.querySelector('#V-MailMessageList button.pw-threads');
        const style = getComputedStyle(button);
        return {
            pressed: button.getAttribute('aria-pressed'),
            title: button.title,
            background: style.backgroundColor,
            color: style.color,
            icon: getComputedStyle(button, '::before').backgroundColor,
            outline: style.boxShadow,
        };
    });
    const label = `${width}px ${scheme} ${enabled ? 'on' : 'off'}`;
    check(label + ' reflects the native setting', state.pressed === String(enabled));
    check(label + ' explains the next action', enabled
        ? state.title === 'Afficher les messages séparément'
        : state.title === 'Grouper par conversation');
    check(label + ' has the matching visual state', enabled
        ? state.background !== 'rgba(0, 0, 0, 0)' && state.outline !== 'none' && state.icon === state.color
        : state.background === 'rgba(0, 0, 0, 0)' && state.outline === 'none');
    await page.locator('#V-MailMessageList button.pw-threads').click();
    check(label + ' sends the opposite setting', await page.evaluate(expected => {
        const call = actionCalls.at(-1);
        return Array.isArray(call) && call[0] === 'UseThreads' && call[1] === expected;
    }, !enabled));
}

console.log(JSON.stringify({passed: checks.length}));
