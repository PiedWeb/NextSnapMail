/* Read-only production benchmark. Never log accounts, subjects, URLs or mail content. */
const page = await browser.getPage('nextcloud-policy');
const result = await page.evaluate(async () => {
    if (!window.rl?.pluginRemoteRequest || !window.PiedWebUx?.feed) throw new Error('Authenticated Mail required');
    if (document.querySelector('#V-PopupsCompose[open]')) throw new Error('Leave an active composer untouched');
    const samples = [];
    for (let run = 0; run < 5; run++) {
        const start = performance.now();
        const measurement = await new Promise(resolve => rl.pluginRemoteRequest((code, data) => resolve({
            ms: Math.round(performance.now() - start), ok: !code && !data?.Result?.error,
            rows: data?.Result?.items?.length || 0, failedAccounts: data?.Result?.accounts?.filter(a => a.error).length || 0
        }), 'PiedWebFeed', {operation:'global'}, 120000));
        samples.push(measurement);
    }
    const sorted = samples.map(s => s.ms).sort((a,b) => a-b);
    return {label:'global-feed-read-only', samples, median:sorted[2], max:sorted[4],
        nodes:document.querySelectorAll('#V-MailMessageList *').length,
        globalRows:document.querySelectorAll('.pw-global-row').length,
        viewport:{width:innerWidth,height:innerHeight}};
});
console.log(JSON.stringify(result));
