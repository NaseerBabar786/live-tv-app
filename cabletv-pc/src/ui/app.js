// Cable TV for PC: starts the screens in the TV app's order. Start screen (sponsor) while the channels
// load, sign-in when the account is needed, then the main screen in 1+List.
import * as nav from './nav.js';
import * as channels from './channels.js';
import * as mine from './mychannel.js';
import * as plans from './plans.js';
import * as account from './account.js';
import * as sponsors from './sponsors.js';
import * as watching from './watching.js';
import { signInConfigured } from './config.js';
import { openStart } from './screens/start.js';
import { openSignIn } from './screens/signin.js';
import { openHome } from './screens/home.js';
import { checkForUpdate } from './screens/update.js';

// Errors in the screens are reported (tv.bulkbazaar.ca/crashes); they don't close the app.
window.addEventListener('error', (e) => window.pc?.error(e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r && (r.name === 'AbortError' || /fetch|network/i.test(String(r.message)))) return;
  window.pc?.error(r && r.message ? r.message : String(r), r && r.stack);
});

let home = null;

async function signedInWork() {
  if (!account.user()) return;
  await account.recordOpen();
  await plans.refresh(account);
  await sponsors.refresh(account);
}

async function main() {
  nav.install();
  const info = (await window.pc?.info()) || { deviceId: 'dev', os: 'PC' };
  account.setDevice(info.deviceId, `PC · ${info.os || ''}`.trim());
  mine.init();
  plans.init();
  channels.reload();
  mine.refresh();
  window.pc?.ready();
  signedInWork();

  const showHome = () => {
    if (home) return;
    home = openHome({ onExit: () => { watching.setForeground(false); account.reportViewing(sponsors.viewsStore).finally(() => window.pc?.quit()); } });
    checkForUpdate();
  };
  openStart(() => {
    if (signInConfigured() && !account.user()) openSignIn(() => { signedInWork(); showHome(); });
    else showHome();
  });

  // Signed out on this PC (another device took the account): sign in again.
  account.onChange(() => {
    if (signInConfigured() && !account.user() && home) openSignIn(() => signedInWork());
  });

  // Our channels' schedules, the package and the sponsors now and then; the totals every 10 minutes.
  setInterval(() => mine.refresh(), 10 * 60000);
  setInterval(() => { plans.refresh(account); sponsors.refresh(account); }, 30 * 60000);
  setInterval(() => account.reportViewing(sponsors.viewsStore), 10 * 60000);
  document.addEventListener('visibilitychange', () => {
    watching.setForeground(!document.hidden);
    if (document.hidden) account.reportViewing(sponsors.viewsStore);
  });
  window.addEventListener('beforeunload', () => watching.setForeground(false));
}

main();
