// Synthetic Nextcloud wrapper; live tests separately exercise its real Vue launcher.
if (new URLSearchParams(location.search).has('shell')) {
    if (new URLSearchParams(location.search).get('shell') !== 'iframe') {
    document.querySelector('.nc-shell')?.remove();
    const content=document.createElement('main');content.id='content';content.className='app-nextsnapmail';
    const app=document.querySelector('#rl-app');app.before(content);content.append(app);
    const header=document.createElement('header');header.id='header';
    header.innerHTML='<div class="header-start"><a id="nextcloud" href="#">Nextcloud</a><nav class="app-menu" aria-label="Applications"><div class="v-popper"><button type="button" class="app-menu__waffle" aria-label="Applications" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="currentColor">'+[6,12,18].flatMap(cx=>[6,12,18].map(cy=>`<circle cx="${cx}" cy="${cy}" r="1.7"/>`)).join('')+'</svg></button></div><button class="app-menu__current-app">Mail</button></nav></div><div class="header-end">Nextcloud search</div>';
    content.before(header);
    const style=document.createElement('style');style.textContent='body{--header-height:48px}#header{height:48px;display:flex;justify-content:space-between;background:teal}#header .header-start{display:flex}.app-menu{display:flex}.app-menu__waffle{width:44px;height:44px}#content.app-nextsnapmail{margin-top:0;height:calc(100dvh - 48px)}#content.app-nextsnapmail #rl-app{position:relative;inset:auto;height:100%;width:100%}html.rl-mobile.pw-mail-shell #rl-left{top:0}';document.head.append(style);
    }
    const script=document.createElement('script');script.src='/.local-work/pied-web-ux/app-shell.js?fixture=173c';document.head.append(script);
}
