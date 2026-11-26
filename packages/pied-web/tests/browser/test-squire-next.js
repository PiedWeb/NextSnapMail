const page=await browser.getPage('nextsnapmail-squire-next');
await page.setViewportSize({width:1280,height:1000});
const results=[];
const check=(name,ok)=>{if(!ok)throw new Error(name);results.push(name);console.log('PASS '+name);};
const fixture='http://127.0.0.1:8876/.local-work/images-native-preview.html';

const checkLinkClicks = async name => {
	const observed = await page.evaluate(async () => {
		const before = 'https://example.test/old';
		const after = 'https://example.test/new';
		htmlEditor.setHtml(`<div>Before <a href="${before}" title="Example"><b>Example link</b></a> after</div>`);
		const root = edit.wysiwyg;
		const link = () => root.querySelector('a');
		const click = options => (link().firstElementChild || link()).dispatchEvent(new MouseEvent('click', {
			bubbles: true, cancelable: true, ...options
		}));
		const settle = () => new Promise(resolve => setTimeout(resolve, 0));
		const originalPrompt = window.prompt;
		const originalOpen = window.open;
		const prompts = [];
		const openings = [];
		let answer = after;
		window.prompt = (_label, value) => { prompts.push(value); return answer; };
		window.open = (...args) => { openings.push(args); };
		try {
			await settle();
			const editPreventedNavigation = !click();
			await settle();
			const changed = editPreventedNavigation && prompts[0] === before &&
				link().href === after && link().title === 'Example' &&
				link().querySelector('b')?.textContent === 'Example link' && root.querySelectorAll('a').length === 1;
			const modifiedPreventedNavigation = !click({ctrlKey: true}) && !click({metaKey: true});
			const opened = modifiedPreventedNavigation && prompts.length === 1 && openings.length === 2 &&
				openings.every(([href, target, features]) => href === after && target === '_blank' && features === 'noopener,noreferrer');
			edit.squire.undo();
			const undone = link().href === before;
			answer = null;
			click();
			const cancelled = link().href === before;
			answer = 'javascript:';
			click();
			const rejected = link().href === before;
			answer = '';
			click();
			const removed = !link() && root.querySelector('b')?.textContent === 'Example link' &&
				root.textContent === 'Before Example link after';
			return {changed, opened, undone, cancelled, rejected, removed};
		} finally {
			window.prompt = originalPrompt;
			window.open = originalOpen;
		}
	});
	for (const [behavior, passed] of Object.entries(observed)) check(`${name} link ${behavior}`, passed);
};

await page.goto(fixture);
await page.waitForFunction(()=>window.markdownReady===true,null,{timeout:10000});
check('The optional editor is registered beside the native editor',await page.evaluate(()=>
	fixtureWysiwygNames.join('|')==='Squire|Squire 2.4 (test)'
));
check('The native editor remains the default',await page.evaluate(()=>
	edit.squire.constructor===window.Squire && edit.squire.constructor!==window.PiedWebSquireNext
));
check('Loading the optional bundle does not replace the global native Squire',await page.evaluate(()=>
	window.Squire!==window.PiedWebSquireNext
));
await checkLinkClicks('Native Squire');

await page.goto(fixture+'?squireNext=1');
await page.waitForFunction(()=>window.markdownReady===true,null,{timeout:10000});
check('The saved editor choice constructs Squire 2.4',await page.evaluate(()=>
	edit.squire.constructor===window.PiedWebSquireNext && window.Squire!==window.PiedWebSquireNext
));
await checkLinkClicks('Squire 2.4');

await page.evaluate(()=>{
	htmlEditor.setHtml('<div><br></div>');
});
await page.locator('.squire-wysiwyg').click();
await page.locator('.squire-wysiwyg').press('Control+i');
await page.locator('.squire-wysiwyg').pressSequentially('a');
check('Ctrl+I formats the next typed character',await page.evaluate(()=>{
	const italic=edit.wysiwyg.querySelector('i');
	const visible=text=>(text||'').replace(/\u200b/g,'');
	return visible(italic?.textContent)==='a' && visible(edit.wysiwyg.textContent)==='a';
}));

await page.evaluate(()=>{
	htmlEditor.setHtml('<div>Une phrase complète.</div><div>Deuxième paragraphe.</div>');
	const text=edit.wysiwyg.firstElementChild.firstChild;
	const range=document.createRange();
	range.setStart(text,4);
	range.setEnd(text,10);
	edit.squire.setSelection(range);
});
if(!await page.locator('[data-action=quote]').isVisible())await page.locator('.pw-compose-more').click();
await page.locator('[data-action=quote]').click();
check('A partial sentence selection quotes its whole paragraph',await page.evaluate(()=>{
	const quote=edit.wysiwyg.querySelector(':scope > blockquote');
	return quote?.textContent==='Une phrase complète.'
		&& edit.wysiwyg.querySelectorAll(':scope > blockquote').length===1
		&& edit.wysiwyg.lastElementChild.textContent==='Deuxième paragraphe.';
}));

await page.evaluate(()=>{
	htmlEditor.setHtml('<div>Premier paragraphe.</div><div>Deuxième paragraphe.</div>');
	const first=edit.wysiwyg.firstElementChild.firstChild;
	const second=edit.wysiwyg.lastElementChild.firstChild;
	const range=document.createRange();
	range.setStart(first,8);
	range.setEnd(second,8);
	edit.squire.setSelection(range);
});
if(!await page.locator('[data-action=quote]').isVisible())await page.locator('.pw-compose-more').click();
await page.locator('[data-action=quote]').click();
check('A cross-paragraph selection quotes both complete paragraphs',await page.evaluate(()=>{
	const quote=edit.wysiwyg.querySelector(':scope > blockquote');
	return edit.wysiwyg.querySelectorAll(':scope > blockquote').length===1
		&& quote?.textContent==='Premier paragraphe.Deuxième paragraphe.'
		&& quote.children.length===2
		&& [...edit.wysiwyg.children].filter(node=>node!==quote).every(node=>!node.textContent);
}));

check('The SnappyMail style adapter uses upstream formatting methods',await page.evaluate(()=>{
	htmlEditor.setHtml('<div>Couleur test</div>');
	const text=edit.wysiwyg.firstElementChild.firstChild;
	const range=document.createRange();
	range.selectNodeContents(text);
	edit.squire.setSelection(range);
	edit.squire.setStyle({color:'#dc2626'});
	return edit.wysiwyg.querySelector('span')?.style.color==='rgb(220, 38, 38)';
}));

check('Representative email HTML survives the editor round trip',await page.evaluate(()=>{
	const source='<div style="font-family:Arial;color:#123456">Bonjour <b>Robin</b></div>'+
		'<blockquote><div>Citation<blockquote><div>Imbriquée</div></blockquote></div></blockquote>'+
		'<table><tbody><tr><td>Cellule A</td><td>Cellule B</td></tr></tbody></table>'+
		'<div class="rl-signature">Signature <a href="https://example.test/path">site</a></div>'+
		'<div><img src="cid:logo@example.test" alt="Logo"></div>';
	htmlEditor.setHtml(source);
	const output=document.createElement('div');
	output.innerHTML=htmlEditor.getData();
	const styled=output.firstElementChild;
	return styled?.style.fontFamily.toLowerCase().includes('arial')
		&& styled?.style.color==='rgb(18, 52, 86)'
		&& output.querySelectorAll('blockquote').length===2
		&& output.querySelectorAll('table td').length===2
		&& output.querySelector('.rl-signature')?.textContent.includes('Signature')
		&& output.querySelector('a')?.getAttribute('href')==='https://example.test/path'
		&& output.querySelector('img')?.getAttribute('src')==='cid:logo@example.test'
		&& output.querySelector('img')?.alt==='Logo';
}));

check('No browser runtime error is raised',await page.evaluate(()=>fixtureErrors.length===0));
console.log(JSON.stringify({passed:results.length,results},null,2));
