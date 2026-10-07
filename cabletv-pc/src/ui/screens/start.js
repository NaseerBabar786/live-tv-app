// The start screen (StartScreen.kt): only a loading circle in the middle while the channels load
// (owner, 2026-10-07: no sponsor or words on the start screen). It closes as soon as the channels
// are in, or after 15 seconds at most.
import { h } from '../dom.js';
import * as nav from '../nav.js';
import * as channels from '../channels.js';

export function openStart(onDone) {
  const root = h('div.start', h('div.spinner'));
  document.getElementById('app').appendChild(root);
  const pop = nav.push(root, () => true);
  const until = Date.now() + 15000;
  (async () => {
    while (channels.state.loading && Date.now() < until) await new Promise((ok) => setTimeout(ok, 200));
    pop();
    root.remove();
    onDone();
  })();
}
