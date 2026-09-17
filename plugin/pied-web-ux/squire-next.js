(() => {
	'use strict';

	const
		bridge = window.PiedWebSquireBridge,
		legacySquire = bridge?.legacy,
		nextSquire = window.Squire,
		name = 'Squire 2.4 (test)';

	delete window.PiedWebSquireBridge;

	if (!legacySquire || !nextSquire || legacySquire === nextSquire) {
		console.error('Pied Web: impossible de charger Squire 2.4 sans remplacer l’éditeur natif.');
		return;
	}

	// The native editor remains the global/default implementation. SquireUI only
	// reads this global while its constructor creates the underlying editor.
	window.Squire = legacySquire;
	window.PiedWebSquireNext = nextSquire;

	const prototype = nextSquire.prototype;

	prototype.getSelectionClosest = function(selector) {
		const root = this.getRoot();
		let node = this.getSelection()?.commonAncestorContainer;
		if (node?.nodeType !== Node.ELEMENT_NODE) {
			node = node?.parentElement;
		}
		const match = node?.closest?.(selector);
		return match && match !== root && root.contains(match) ? match : null;
	};

	prototype.changeIndentationLevel = function(direction) {
		const parent = this.getSelectionClosest('UL,OL,BLOCKQUOTE');
		if (!parent && direction !== 'increase') {
			return this;
		}
		const kind = !parent || parent.nodeName === 'BLOCKQUOTE' ? 'Quote' : 'List';
		return this[direction + kind + 'Level']();
	};

	prototype.setStyle = function(style) {
		if (!style) {
			return this.removeAllFormatting();
		}
		const setters = {
			backgroundColor: 'setHighlightColor',
			color: 'setTextColor',
			fontFamily: 'setFontFace',
			fontSize: 'setFontSize'
		};
		Object.entries(style).forEach(([property, value]) => {
			const setter = setters[property];
			if (setter) {
				this[setter](value);
			}
		});
		return this;
	};

	if (typeof window.rl?.registerWYSIWYG !== 'function' || typeof window.SquireUI !== 'function') {
		console.error('Pied Web: l’API WYSIWYG de SnappyMail est indisponible.');
		return;
	}

	window.rl.registerWYSIWYG(name, (_owner, container, onReady) => {
		const previous = window.Squire;
		try {
			window.Squire = nextSquire;
			onReady(new window.SquireUI(container));
		} finally {
			window.Squire = previous;
		}
	});
})();
