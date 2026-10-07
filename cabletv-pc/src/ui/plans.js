// Cable TV's packages: Free, Gold and Promotional (Plans.kt and Subscription.kt; Silver and Platinum were
// removed in 1.9.91 and count as Gold). Free is fixed: every feature, only our own channels.
// While the owner hasn't turned packages on (config/plans "enforce"), everyone has everything.
import { nameKey } from './util.js';
import * as store from './store.js';
import * as mine from './mychannel.js';
import * as fb from './firebase.js';

export const TIERS = ['Free', 'Gold', 'Promo'];
export const TIER_LABEL = { Free: 'Free', Gold: 'Gold', Promo: 'Promotional' };
/** A saved package name; the old Silver and Platinum count as Gold (Plans.Tier.of). */
export const tierOf = (name) => {
  const n = String(name || '').toLowerCase();
  if (n === 'silver' || n === 'platinum') return 'Gold';
  return TIERS.find((x) => x.toLowerCase() === n) || null;
};

/** What a package can include; the keys are the ones tv.bulkbazaar.ca/packages saves. */
export const FEATURES = [
  ['channels', 'All channels'], ['browse', 'Browse'], ['carousel', 'Carousel'], ['strip', 'Strip'], ['two', '1×2'],
  ['five', '1+3'], ['duo', 'Duo'], ['four', '2×2'], ['six', '2×3'], ['news', 'News'], ['cp24', 'CP24'], ['home', 'Home'],
  ['mine', 'My Screen'], ['library', 'Movies & Dramas'], ['games', 'Games'], ['devices', '2 devices'],
];
const KEYS = FEATURES.map(([k]) => k);
const parse = (list) => new Set(String(list || '').split(',').map((s) => s.trim()).filter((k) => KEYS.includes(k)));

/** Free's features, fixed (Plans.FREE_FEATURES); every other package has them too. */
export const FREE_FEATURES = new Set(KEYS.filter((k) => k !== 'channels'));
export const DEFAULT_FEATURES = {
  Free: FREE_FEATURES,
  Gold: new Set(KEYS),
  Promo: new Set(KEYS.filter((k) => k !== 'devices')),
};
/** Free fixed, every other package at least Free (Plans.setFeatures). */
const withFree = (m) => Object.fromEntries(TIERS.map((t) => [t, t === 'Free' ? new Set(FREE_FEATURES) : new Set([...(m[t] || []), ...FREE_FEATURES])]));
const EVERYTHING = Object.fromEntries(TIERS.map((t) => [t, new Set(KEYS)]));

export const DEFAULT_HOW_TO_PAY =
  "Pick a package below and press Ask. We'll message you back here with how to pay " +
  "(Interac e-Transfer or card), and turn your package on as soon as it's paid. " +
  'Questions? WhatsApp 437 602 6500.';

const DEFAULT_PRICES = { Gold: '$3.99' };

let features = EVERYTHING;
let current = 'Gold';
let extra = new Set();
export const offer = { enforced: false, trialDays: 7, prices: { ...DEFAULT_PRICES }, howToPay: DEFAULT_HOW_TO_PAY, extraChannels: '' };
export const status = { tier: 'Gold', until: null, trial: false, promoName: null };

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach((fn) => fn());

export const has = (key) => !!features[current]?.has(key);
export const tier = () => current;
/** The first package for sale with [key], for "needs Gold". */
export const lowestWith = (key) => TIERS.find((t) => t !== 'Promo' && features[t]?.has(key)) || 'Gold';
/** The channels of a package without All channels: our own, plus the ones the owner added. */
export const freeChannel = (c) => mine.isMine(c) || extra.has(nameKey(c.name));
export const allowsChannel = (c) => has('channels') || freeChannel(c);
export const twoDevices = () => offer.enforced && has('devices');

function setExtra(names) {
  extra = new Set(String(names || '').split(',').map((s) => nameKey(s.trim())).filter(Boolean));
}

/** The last known package, so a start without internet keeps it (Subscription.init). */
export function init() {
  const saved = store.get('plans', null);
  if (!saved) return;
  if (saved.features) features = withFree(saved.features);
  setExtra(saved.extra);
  const savedTier = tierOf(saved.tier);
  if (savedTier) current = saved.until && saved.until < Date.now() ? 'Free' : savedTier;
}

/** Reads the offer and the viewer's package; keeps the last known one when offline (Subscription.refresh). */
export async function refresh(account) {
  const u = account.user();
  if (!u) return;
  try {
    const t = await account.token();
    const cfg = (await fb.get('config/plans', t)) || {};
    const promoDoc = (await fb.get('config/promos', t)) || {};
    let promos = [];
    try { promos = JSON.parse(promoDoc.items || '[]'); } catch {}
    offer.enforced = !!cfg.enforce;
    offer.trialDays = Math.max(0, Math.min(365, cfg.trialDays ?? 7));
    offer.howToPay = String(cfg.howToPay || '').trim() || DEFAULT_HOW_TO_PAY;
    offer.extraChannels = String(cfg.extra_channels || '').trim();
    for (const t of ['Gold']) offer.prices[t] = String(cfg[`${t.toLowerCase()}_month`] || '').trim() || DEFAULT_PRICES[t];
    let feats = Object.fromEntries(TIERS.map((t) => {
      const key = `${t.toLowerCase()}_features`;
      return [t, key in cfg ? parse(cfg[key]) : DEFAULT_FEATURES[t]];
    }));
    const now = Date.now();
    let st = { tier: 'Gold', until: null, trial: false, promoName: null };
    if (offer.enforced) {
      const plan = await fb.get(`plans/${u.uid}`, t);
      const paid = tierOf(plan?.tier);
      const paidUntil = plan?.until instanceof Date ? plan.until.getTime() : null;
      const joinedDoc = await fb.get(`users/${u.uid}`, t);
      const joined = joinedDoc?.joined instanceof Date ? joinedDoc.joined.getTime() : now;
      const trialEnd = joined + offer.trialDays * 86400000;
      const promo = paid === 'Promo' ? promos.find((p) => p && p.id === plan?.promo) : null;
      if (promo) feats = { ...feats, Promo: parse(promo.features) };
      const promoName = paid === 'Promo' ? (promo?.name || plan?.promoName || null) : null;
      if (paid && paid !== 'Free' && paidUntil && paidUntil > now) st = { tier: paid, until: paidUntil, trial: false, promoName };
      else if (offer.trialDays > 0 && trialEnd > now) st = { tier: 'Gold', until: trialEnd, trial: true, promoName: null };
      else st = { tier: 'Free', until: null, trial: false, promoName: null };
    }
    Object.assign(status, st);
    features = offer.enforced ? withFree(feats) : EVERYTHING;
    current = st.tier;
    setExtra(offer.extraChannels);
    store.set('plans', {
      tier: st.tier, until: st.until || 0, extra: offer.extraChannels,
      features: offer.enforced ? Object.fromEntries(TIERS.map((x) => [x, [...features[x]]])) : null,
    });
    changed();
  } catch {}
}

/** What [t] has, in a line for the packages box. */
export function describe(t) {
  // Every package has at least what Free has.
  const set = new Set([...(features[t] || []), ...FREE_FEATURES]);
  const channels = set.has('channels') ? 'All channels' : offer.extraChannels ? `Our own Bazaar channels plus ${offer.extraChannels}` : 'Only our own Bazaar channels';
  const extras = FEATURES.filter(([k]) => k !== 'channels' && set.has(k)).map(([, l]) => l);
  return `${channels}. 1+List${extras.map((e) => `, ${e}`).join('')}, full screen and favourites`;
}

let asker = null;
/** The screen that shows "needs Gold" (set by the app). */
export const setAsker = (fn) => { asker = fn; };

/** Shows the packages (true is returned) when the viewer's package doesn't have [key]. */
export function ask(label, key) {
  if (has(key)) return false;
  if (asker) asker(label, lowestWith(key));
  return true;
}
