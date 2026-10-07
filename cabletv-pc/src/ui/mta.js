// MTA (Muslim Television Ahmadiyya): its 8 live channels from its own servers (data/Mta.kt in the TV app).
// Off until the viewer turns MTA on in Settings; then they come right after our Bazaar channels
// (numbers 16 to 23, the other channels from 24) and are free in every package.
const CDN = 'https://dq1c55erlhlb2.cloudfront.net/out/v1/prod-mtai-live-shared';

const channel = (name, id, language, logo) => ({
  name,
  url: `${CDN}/prod_${id}/prod_${id}-origin-v1/index-hls.m3u8`,
  logo: `https://i.imgur.com/${logo}.png`,
  group: 'MTA',
  language,
  category: 'Religious',
  country: 'uk',
  alternates: [],
});

export const CHANNELS = [
  channel('MTA1 World', 'mta1_world_main', 'Urdu', 'bYiRfAg'),
  channel('MTA2 Europe', 'mta2_europe', 'Urdu', 'aVts0sz'),
  channel('MTA3 Al-Arabia', 'mta3_alarabia', 'Arabic', 'm3PEldJ'),
  channel('MTA4 Africa', 'mta4_africa', 'English', 'lmVeQQX'),
  channel('MTA5 Africa', 'mta5_africa', 'English', '9Cobb2i'),
  channel('MTA6 Asia', 'mta6_asia', 'Urdu', 'nhCNPJI'),
  channel('MTA7 Asia', 'mta7_asia', 'Urdu', '3Nl8Tpu'),
  channel('MTA8 America', 'mta8_america', 'English', 'CF6X9wB'),
];

const urls = new Set(CHANNELS.map((c) => c.url));
export const isMta = (c) => !!c && urls.has(c.url);

/** MTA's old Akamai links, still in public lists: refused, or all play MTA1. */
export const isOldLink = (url) => /^https?:\/\/(chlivemta1?|livemtaasia)\.akamaized\.net\//.test(url);
