// New versions: the approved one for everyone, and the owner's test version (Settings). An installed
// copy updates itself (downloads the installer and runs it quietly, then opens again); the portable
// copy opens the download page.
import { h, dialog, toast } from '../dom.js';
import * as account from '../account.js';

export async function checkForUpdate({ manual = false, test = false } = {}) {
  const r = await window.pc?.checkUpdate(account.isAdmin());
  if (!r) return;
  const which = test ? 'test' : 'approved';
  const version = test ? r.test : r.newer;
  if (!version) {
    if (manual) toast(test ? 'There is no test version right now.' : r.error ? "Couldn't check for updates. Check the internet connection." : `You have the newest version (${r.version}).`);
    return;
  }
  const progress = h('div.progress', h('div.bar'));
  const body = h('div', h('p', test
    ? `Test version ${version} is ready (you have ${r.version}). It goes to everyone only after you approve it.`
    : `Cable TV for PC ${version} is ready (you have ${r.version}).`), progress);
  progress.classList.add('hidden');
  const close = dialog({
    title: test ? 'Try the test version?' : 'New update available',
    body,
    buttons: [['Update now', async () => {
      progress.classList.remove('hidden');
      try {
        const res = await window.pc.install(which);
        if (res && res.opened) { close(); toast('The download page is open in your browser.'); }
      } catch {
        close();
        toast("The update couldn't download. Try again later.");
      }
    }, true], ['Later', null]],
  });
  window.pc?.on('install-progress', (p) => { progress.firstChild.style.width = `${Math.round((p || 0) * 100)}%`; });
}
