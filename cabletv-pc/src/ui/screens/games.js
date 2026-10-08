// Games (GamesScreen.kt): the modern games, Block Burst and Color Pour. They are the very same pages as
// the TV app's (app/src/main/assets/games, copied in by scripts/prepare.js), played here with the
// keyboard (arrows, Enter; Esc goes back) or the mouse. The TV app's 24 classic games come to PC later.
import { h } from '../dom.js';
import * as nav from '../nav.js';
import * as store from '../store.js';

/** In step with WEB_GAMES in Game.kt. */
export const GAMES = [
  { id: 'blockburst', name: 'Block Burst', icon: '💥', page: 'blockburst.html', label: (v) => `Best: ${v}` },
  { id: 'colorpour', name: 'Color Pour', icon: '🧪', page: 'colorpour.html', label: (v) => `Level ${v} done` },
];

const recordOf = (id) => store.get(`game.${id}`, 0);

export function openGames({ onClose }) {
  const grid = h('div.games-grid');
  const root = h('div.games',
    h('div.games-head', h('h1', '🎮 Games'), h('span.games-sub', 'Play with the arrows and Enter, or the mouse. Esc goes back.')),
    grid,
    h('p.games-more', 'The other 24 games (Ludo, Chess, Cricket and more) are on the Cable TV app for TV, and are coming to PC soon.'));
  document.getElementById('app').appendChild(root);

  let frame = null, popFrame = null, lastId = GAMES[0].id;

  function render() {
    grid.replaceChildren(...GAMES.map((g) => {
      const v = recordOf(g.id);
      return h('button.game-card', { focus: true, 'data-id': g.id, on: { click: () => play(g) } },
        h('span.game-new', 'NEW'), h('div.game-icon', g.icon), h('div.game-name', g.name),
        h('div.game-rec', v > 0 ? g.label(v) : 'New'));
    }));
    nav.focus(grid.querySelector(`[data-id="${lastId}"]`) || grid.firstChild);
  }

  function play(g) {
    lastId = g.id;
    frame = h('iframe.game-frame', { src: `shared/games/${g.page}`, title: g.name });
    document.body.appendChild(frame);
    frame.addEventListener('load', () => { frame.contentWindow.focus(); frame.contentDocument?.getElementById('game')?.focus(); });
    // Keys go to the game while it has the focus; a click outside it brings Back here.
    popFrame = nav.push(frame, (key) => { if (key === 'back') { stop(); return true; } return true; });
  }

  function stop() {
    if (!frame) return;
    frame.remove(); frame = null;
    popFrame && popFrame(); popFrame = null;
    render();
  }

  function onMessage(e) {
    const m = e.data;
    if (!m || !m.cableGame || !frame || e.source !== frame.contentWindow) return;
    if (m.cableGame === 'exit') stop();
    if (m.cableGame === 'record' && GAMES.some((g) => g.id === m.id) && Number(m.value) > recordOf(m.id)) store.set(`game.${m.id}`, Number(m.value));
  }
  window.addEventListener('message', onMessage);

  const pop = nav.push(root, (key) => {
    if (key === 'back') { close(); return true; }
    return false;
  });
  function close() {
    stop();
    pop();
    window.removeEventListener('message', onMessage);
    root.remove();
    onClose && onClose();
  }
  render();
  return close;
}
