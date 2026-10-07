// Bits the modes share.
import { countryCode, initials } from '../util.js';
import { h, toast, dialog } from '../dom.js';
import * as channels from '../channels.js';
import * as mine from '../mychannel.js';

/** "PK · Geo News" (ChannelListScreen countryName). */
export const listName = (c) => {
  const code = countryCode(c);
  return code ? `${code} · ${c.name}` : c.name;
};

/** Holding OK on a channel: add it to Favorites, or take it out. */
export function favoriteMenu(ch, after) {
  if (mine.isMine(ch)) { toast('Our own channels are always at the top.'); return; }
  const fav = channels.state.favorites.has(ch.url);
  dialog({
    title: ch.name,
    buttons: [[fav ? '☆  Remove from favorites' : '★  Add to favorites', () => {
      const msg = channels.toggleFavorite(ch);
      toast(msg || (fav ? `${ch.name} removed from Favorites` : `${ch.name} added to Favorites`));
      after && after();
    }], ['Cancel', null]],
  });
}

/** A channel's label on a tile: number and name. */
export const tileLabel = (ch) => h('div.tile-label', ch.number > 0 ? `${ch.number}  ${ch.name}` : ch.name);

/** The logo, or the initials when there is none. */
export function logo(ch) {
  if (ch.logo) {
    const img = h('img.chlogo', { src: ch.logo, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(h('div.initials', initials(ch.name))));
    return img;
  }
  return h('div.initials', initials(ch.name));
}
