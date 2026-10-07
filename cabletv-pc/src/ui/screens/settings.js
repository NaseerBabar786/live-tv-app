// Settings: account and package, countries, languages, equal volume, updates and About.
import { h, button, dialog, toast } from '../dom.js';
import * as nav from '../nav.js';
import * as channels from '../channels.js';
import * as account from '../account.js';
import * as plans from '../plans.js';
import * as store from '../store.js';
import { BUILD, signInConfigured } from '../config.js';
import { checkForUpdate } from './update.js';
import { openSignIn } from './signin.js';

export function openSettings({ onChanged, onExit }) {
  const body = h('div.settings');
  const close = dialog({ title: 'Settings', body, wide: true });

  const row = (label, sub, onClick) => h('button.setrow', { focus: true, on: { click: onClick } },
    h('div.set-label', label), sub ? h('div.set-sub', sub) : null);

  const u = account.user();
  const st = plans.status;
  if (signInConfigured() || u) {
    body.appendChild(row(u ? `Signed in as ${u.name || u.email}` : 'Sign in', u ? `${u.email} · Press OK to sign out` : 'Google or email', () => {
      close();
      if (u) {
        dialog({ title: 'Sign out?', body: 'You can sign in again any time.', buttons: [['Sign out', () => { account.signOut(); if (signInConfigured()) openSignIn(() => {}); }], ['Cancel', null]], focusIndex: 1 });
      } else openSignIn(() => {});
    }));
  }
  if (plans.offer.enforced) {
    const until = st.until ? ` until ${new Date(st.until).toLocaleDateString()}` : '';
    body.appendChild(row(`Package: ${st.promoName || plans.TIER_LABEL[st.tier]}${st.trial ? ' (free trial)' : ''}${until}`, plans.describe(st.tier), () => showPackages('', null)));
  }
  body.appendChild(row('Choose countries', countriesLabel(), () => { close(); pickCountries(onChanged); }));
  body.appendChild(row('Languages', channels.state.languageFilter.size ? [...channels.state.languageFilter].join(', ') : 'All languages', () => { close(); pickLanguages(onChanged); }));
  const eq = store.get('equalVolume', true);
  body.appendChild(row(`Equal volume: ${eq ? 'On' : 'Off'}`, 'Every channel at about the same loudness', () => {
    store.set('equalVolume', !eq);
    close();
    toast(`Equal volume is ${eq ? 'off' : 'on'}. It applies from the next channel.`);
  }));
  body.appendChild(row('Reload the channel list', 'Fetch the newest working channels', () => { close(); channels.reload(); toast('Loading the newest channels…'); }));
  body.appendChild(row('Check for updates', `Cable TV for PC ${BUILD.version}`, () => { close(); checkForUpdate({ manual: true }); }));
  if (account.isAdmin()) {
    body.appendChild(row('Try the test version', 'Owner only: the newest build before it goes to everyone', () => { close(); checkForUpdate({ manual: true, test: true }); }));
  }
  body.appendChild(row('Visit tv.bulkbazaar.ca', 'Our website, the TV app and the install guide', () => window.pc?.openExternal('https://tv.bulkbazaar.ca')));
  body.appendChild(row('About', `Cable TV for PC ${BUILD.version}, in step with Cable TV ${BUILD.matches} on Android TV`, () => {}));
  body.appendChild(row('Exit Cable TV', '', () => { close(); onExit(); }));
  nav.focus(body.firstChild);
}

function countriesLabel() {
  const s = channels.state.source;
  if (s === channels.SOURCE_MIX) return 'Pakistani, Indian, Canadian, British and American';
  if (s === channels.SOURCE_ALL) return 'All countries';
  const picked = channels.pickedCountries(s);
  if (picked) return picked.map((c) => channels.MIX.find((m) => m.country === c)?.title || c.toUpperCase()).join(', ');
  return channels.title();
}

function pickCountries(onChanged) {
  const picked = new Set(channels.pickedCountries(channels.state.source) || (channels.state.source === channels.SOURCE_MIX ? channels.MIX.map((m) => m.country) : []));
  const all = channels.state.source === channels.SOURCE_ALL;
  const body = h('div.picklist');
  let everything = all;
  const boxes = [];
  const allRow = h('button.pick', { focus: true, on: { click: () => { everything = !everything; draw(); } } });
  body.appendChild(allRow);
  for (const m of channels.MIX) {
    const b = h('button.pick', { focus: true, on: { click: () => { if (picked.has(m.country)) picked.delete(m.country); else picked.add(m.country); everything = false; draw(); } } });
    b.dataset.code = m.country;
    b.dataset.title = m.title;
    boxes.push(b);
    body.appendChild(b);
  }
  function draw() {
    allRow.textContent = `${everything ? '☑' : '☐'}  All countries (every free channel we checked)`;
    boxes.forEach((b) => { b.textContent = `${!everything && picked.has(b.dataset.code) ? '☑' : '☐'}  ${b.dataset.title}`; });
  }
  draw();
  dialog({
    title: 'Choose countries', body, wide: true,
    buttons: [['Save', () => {
      if (everything) channels.setSource(channels.SOURCE_ALL);
      else if (!picked.size || picked.size === channels.MIX.length) channels.setSource(channels.SOURCE_MIX);
      else channels.setSource(channels.pickSource(channels.MIX.map((m) => m.country).filter((c) => picked.has(c))));
      onChanged && onChanged();
    }], ['Cancel', null]],
  });
  nav.focus(allRow);
}

function pickLanguages(onChanged) {
  const chosen = new Set(channels.state.languageFilter);
  const body = h('div.picklist');
  const langs = channels.allLanguages();
  const btns = langs.map((l) => {
    const b = h('button.pick', { focus: true, on: { click: () => { if (chosen.has(l)) chosen.delete(l); else chosen.add(l); draw(); } } });
    b.dataset.lang = l;
    return b;
  });
  body.append(h('p.hint', 'Tick the languages to show. None ticked shows every language.'), ...btns);
  function draw() { btns.forEach((b) => { b.textContent = `${chosen.has(b.dataset.lang) ? '☑' : '☐'}  ${b.dataset.lang}`; }); }
  draw();
  dialog({ title: 'Languages', body, wide: true, buttons: [['Save', () => { channels.setLanguages(chosen); onChanged && onChanged(); }], ['Cancel', null]] });
  if (btns[0]) nav.focus(btns[0]);
}

/** "[label] needs the Gold package": what each package has, the prices and how to pay (PlansScreen.kt). */
export function showPackages(label, needed) {
  const body = h('div.packages');
  if (needed) body.appendChild(h('p.need', `${label} needs the ${plans.TIER_LABEL[needed]} package.`));
  for (const t of ['Free', 'Gold']) {
    body.appendChild(h(`div.package${t === needed ? '.on' : ''}`, h('div.pk-name', `${t}  ·  ${plans.offer.prices[t] ? `${plans.offer.prices[t]} a month` : 'free'}`), h('div.pk-has', plans.describe(t))));
  }
  body.appendChild(h('p.howto', plans.offer.howToPay));
  dialog({
    title: 'Cable TV packages', body, wide: true,
    buttons: [['Ask on WhatsApp', () => window.pc?.openExternal('https://wa.me/14376026500')], ['Close', null]],
  });
}
plans.setAsker(showPackages);
