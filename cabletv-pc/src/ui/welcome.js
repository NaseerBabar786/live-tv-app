// The welcome invitation (owner, 2026-10-08; Welcome.kt): every viewer who hasn't used the WELCOME promo code is
// invited to try Gold free for one month and leave us a good review, with a one-press "Use code WELCOME".
// It pops up once per account (users/{uid}.welcomeAt), and stays in Settings while the code still works for them.
import * as fb from './firebase.js';
import * as plans from './plans.js';

export const CODE = 'WELCOME';
export const TITLE = '🎁 Try Gold free for one month';
export const TEXT = 'Welcome to Cable TV! As a thank-you for joining us, try Gold free for one month: ' +
  `every channel and every feature. Press "Use code ${CODE}", or type promo code ${CODE} in Settings > Packages. ` +
  'One free month per account.\n\n' +
  'Look around, enjoy the app, and if you like it, please leave us a good review ★★★★★ and tell your friends. ' +
  'Thank you! The Cable TV team';

/** { sentAt, canUse }, or null when there's nothing to show (the owner, not signed in, no WELCOME code). */
export async function state(account) {
  const u = account.user();
  if (!u || account.isAdmin()) return null;
  try {
    const t = await account.token();
    const code = await fb.get(`promoCodes/${CODE}`, t);
    if (!code) return null;
    const used = !!(code.usedBy && code.usedBy[u.uid]);
    // Someone already paying for Gold (or on a promotion) isn't invited; the free trial still is.
    const st = plans.status;
    const paying = !st.trial && st.tier !== 'Free' && !!st.until;
    const canUse = code.active !== false && !used && (Number(code.used) || 0) < (Number(code.uses) || 0) && !paying;
    const userDoc = await fb.get(`users/${u.uid}`, t);
    const sentAt = userDoc?.welcomeAt instanceof Date ? userDoc.welcomeAt : null;
    return !canUse && !sentAt ? null : { sentAt, canUse };
  } catch {
    return null;
  }
}

/** Remembers that the invitation popped up for this account, so it doesn't pop up again. */
export async function markSent(account) {
  const u = account.user();
  if (!u) return;
  try { await fb.patch(`users/${u.uid}`, { welcomeAt: new Date() }, await account.token()); } catch {}
}
