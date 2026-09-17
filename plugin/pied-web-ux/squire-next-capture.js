(() => {
	'use strict';

	// The upstream bundle exposes itself as window.Squire. Keep the native
	// SnappyMail fork so loading the optional editor cannot replace the default.
	window.PiedWebSquireBridge = {legacy: window.Squire};
})();
