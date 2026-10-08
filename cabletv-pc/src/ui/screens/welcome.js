// The welcome invitation box (WelcomeInvite.kt): Gold free for one month with code WELCOME, in one press.
import { h, dialog, toast } from '../dom.js';
import * as account from '../account.js';
import * as plans from '../plans.js';
import * as welcome from '../welcome.js';

export function openWelcome(canUse = true) {
  const result = h('p.need');
  const body = h('div', ...welcome.TEXT.split('\n\n').map((p) => h('p', p)), result);
  let busy = false;
  const use = async () => {
    if (busy) return;
    busy = true;
    result.textContent = 'Please wait…';
    let msg;
    try { msg = await plans.redeem(account, welcome.CODE); } catch (e) { msg = `Couldn't use the code: ${e.message || 'check the internet connection'}`; }
    busy = false;
    if (msg.startsWith('Done')) { close(); toast(msg, 6000); } else result.textContent = msg;
  };
  const close = dialog({
    title: welcome.TITLE, body, wide: true,
    buttons: canUse ? [[`Use code ${welcome.CODE}`, use, true], ['Later', null]] : [['Close', null]],
  });
  return close;
}

/** About 25 seconds after start: the invitation, once per account, for a viewer who can still use the code. */
export function scheduleWelcome() {
  setTimeout(async () => {
    const st = await welcome.state(account);
    if (!st || st.sentAt || !st.canUse) return;
    await welcome.markSent(account);
    openWelcome(true);
  }, 25000);
}
