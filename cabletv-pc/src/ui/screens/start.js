// The start screen (SponsorScreen.kt): thanks and a word from our sponsor for 5 seconds while the
// channels load; then it waits for them at most 10 seconds more. OK (or a click) opens the sponsor's site.
import { h } from '../dom.js';
import * as nav from '../nav.js';
import * as sponsors from '../sponsors.js';
import * as channels from '../channels.js';

export function openStart(onDone) {
  const sponsor = sponsors.next('start');
  if (sponsor) sponsors.count(sponsor, 'start');
  const site = sponsor ? sponsors.site(sponsor) : 'https://bulkbazaar.ca';
  const left = h('p.muted.countdown', '');
  const root = h('div.start', { on: { click: visit } });
  const col = h('div.start-col');
  if (sponsor) {
    col.append(...[h('p.muted', 'Cable TV stays free thanks to our sponsors'), h('img.start-pic', { src: sponsor.image, alt: sponsor.name }),
      sponsor.name ? h('h2', sponsor.name) : null, sponsor.line ? h('p', sponsor.line) : null, sponsor.contact ? h('p.contact', sponsor.contact) : null, left].filter(Boolean));
  } else {
    col.append(
      h('img.logo.big', { src: 'logo.svg', alt: '' }),
      h('p', 'Cable TV stays free thanks to our sponsor, Bulk Bazaar Inc. Please show them love: visit bulkbazaar.ca and leave them a 5-star review ★★★★★'),
      h('p', 'Visit our app store, App Bazaar, for more free and useful apps: apps.bulkbazaar.ca'),
      h('p.accent', 'Enjoying Cable TV? Please share it with your family and friends!'),
      left);
  }
  if (site) col.appendChild(h('div.visit-pill', 'Press OK (or click) to visit their website'));
  root.appendChild(col);
  document.getElementById('app').appendChild(root);
  const openedAt = Date.now();
  function visit() {
    if (Date.now() - openedAt < 2000 || !site) return;
    if (sponsor) sponsors.count(sponsor, 'click');
    window.pc?.openExternal(site);
  }
  const pop = nav.push(root, (key) => { if (key === 'ok') visit(); return true; });
  let secs = 5;
  const tick = () => { left.textContent = secs > 0 ? `Starting in ${secs}…` : 'Loading channels…'; };
  tick();
  const timer = setInterval(async () => {
    secs--;
    tick();
    if (secs > 0) return;
    clearInterval(timer);
    const until = Date.now() + 10000;
    while (channels.state.loading && Date.now() < until) await new Promise((ok) => setTimeout(ok, 200));
    pop();
    root.remove();
    onDone();
  }, 1000);
}
