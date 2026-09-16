/* No message or credential is stored here: only a cancellable callback. */
window.PiedWebUx = window.PiedWebUx || {};
/* One window for the whole feature: the countdown, the label counting it down and
 * the checks that measure it. Long enough to catch a wrong recipient, short enough
 * that a message you meant to send is not held back. */
window.PiedWebUx.sendDelaySeconds = 3;
window.PiedWebUx.createSendDelay = function (changed, clock = {
    now: () => Date.now(), later: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id)
}) {
    let task = null, timer, deadline = 0;
    const clear = () => { clock.clear(timer); task = null; };
    const tick = () => {
        if (!task) return;
        const remaining = Math.max(0, deadline - clock.now());
        if (!remaining) {
            const send = task;
            clear();
            changed(0);
            send();
        } else {
            changed(Math.ceil(remaining / 1000));
            timer = clock.later(tick, Math.min(250, remaining));
        }
    };
    return {
        pending: () => !!task,
        start(send) {
            if (task) return false;
            task = send;
            deadline = clock.now() + window.PiedWebUx.sendDelaySeconds * 1000;
            tick();
            return true;
        },
        cancel() {
            if (!task) return false;
            clear();
            changed(0);
            return true;
        }
    };
};
