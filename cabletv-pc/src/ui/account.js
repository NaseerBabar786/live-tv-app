// Signing in to Cable TV, the same accounts as the TV app (Account.kt, GoogleSignIn.kt): Google with a
// code approved on a phone (google.com/device), or an email and password. One device per account,
// the newest device wins; the owner's own account is the exception on PC, so testing here never signs
// their TV out.
import { FIREBASE, BUILD } from './config.js';
import * as store from './store.js';
import * as fb from './firebase.js';
import * as plans from './plans.js';
import * as watching from './watching.js';
import { today } from './util.js';
import * as features from './features.js';

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
const SECURE_TOKEN = 'https://securetoken.googleapis.com/v1';

let saved = store.get('account', null); // { uid, name, email, provider, refresh, claim }
let idToken = null;
let idTokenExpires = 0;
let deviceId = '';
let deviceName = 'PC';
let noticeText = null;

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach((fn) => fn());

export const user = () => (saved && saved.refresh ? { uid: saved.uid, name: saved.name || '', email: saved.email || '' } : null);
export const isAdmin = () => !!saved && String(saved.email || '').toLowerCase() === FIREBASE.adminEmail;
export const usesPassword = () => !!saved && saved.provider === 'password';
/** Why the viewer was signed out (for example, used on another device). */
export const notice = () => noticeText;

export function setDevice(id, name) { deviceId = id; deviceName = name || 'PC'; }

/** Firebase's error codes, in plain words (Account.friendly). */
export function friendly(code) {
  const c = String(code || '');
  if (c.startsWith('EMAIL_EXISTS')) return "There's already an account with this email. Sign in instead, or use Forgot password.";
  if (/^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND)/.test(c)) return 'The email or password is wrong. Check them and try again.';
  if (/^(INVALID_EMAIL|MISSING_EMAIL)/.test(c)) return "That doesn't look like an email address.";
  if (/^(WEAK_PASSWORD|MISSING_PASSWORD)/.test(c)) return 'The password needs at least 6 characters.';
  if (c.startsWith('USER_DISABLED')) return 'This account has been turned off. Please contact us.';
  if (c.startsWith('TOO_MANY_ATTEMPTS')) return 'Too many tries. Wait a few minutes and try again.';
  if (/^(OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED)/.test(c)) return "Email sign-in isn't switched on yet. Please use Google for now.";
  if (!c || c === 'Failed to fetch' || /abort/i.test(c)) return 'Check the internet connection and try again.';
  return c;
}

function remember(r, name, provider) {
  saved = { uid: r.localId, name: name || '', email: r.email || '', provider, refresh: r.refreshToken, claim: true };
  store.set('account', saved);
  noticeText = null;
  idToken = r.idToken;
  idTokenExpires = Date.now() + Number(r.expiresIn || 3600) * 1000;
  changed();
  return user();
}

// ---------- Google: the code shown on screen, approved on a phone ----------

/** Asks Google for a code to show: { userCode, url, deviceCode, interval, expiresAt }. */
export async function startGoogle() {
  const r = await fb.postForm('https://oauth2.googleapis.com/device/code', { client_id: FIREBASE.tvClientId, scope: 'openid email profile' });
  return {
    userCode: r.user_code, url: r.verification_url || 'https://www.google.com/device', deviceCode: r.device_code,
    interval: Math.max(1, r.interval || 5), expiresAt: Date.now() + (r.expires_in || 1800) * 1000,
  };
}

/** Waits until the viewer approves [code] on their phone, then signs in. [cancelled]() stops waiting. */
export async function awaitGoogle(code, cancelled = () => false) {
  let interval = code.interval;
  while (Date.now() < code.expiresAt) {
    await new Promise((ok) => setTimeout(ok, interval * 1000));
    if (cancelled()) throw new Error('cancelled');
    let r;
    try {
      r = await fb.postForm('https://oauth2.googleapis.com/token', {
        client_id: FIREBASE.tvClientId, client_secret: FIREBASE.tvClientSecret, device_code: code.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
    } catch (e) {
      if (e.message === 'authorization_pending' || e.code === 428) continue;
      if (e.message === 'slow_down') { interval += 5; continue; }
      if (e.message === 'access_denied') throw new Error('Sign-in was cancelled on the phone.');
      if (e.message === 'expired_token') throw new Error('The code ran out. Try again for a new one.');
      throw new Error(friendly(e.message));
    }
    const s = await fb.postJson(`${IDENTITY}/accounts:signInWithIdp?key=${FIREBASE.apiKey}`, {
      postBody: `id_token=${encodeURIComponent(r.id_token)}&providerId=google.com`,
      requestUri: 'https://tv.bulkbazaar.ca', returnSecureToken: true, returnIdpCredential: true,
    });
    return remember(s, s.displayName || s.fullName || '', 'google');
  }
  throw new Error('The code ran out. Try again for a new one.');
}

// ---------- Email and password ----------

async function emailCall(endpoint, email, password) {
  try {
    return await fb.postJson(`${IDENTITY}/${endpoint}?key=${FIREBASE.apiKey}`, { email: email.trim(), password, returnSecureToken: true });
  } catch (e) {
    throw new Error(friendly(e.message));
  }
}

export async function signInWithEmail(email, password) {
  const r = await emailCall('accounts:signInWithPassword', email, password);
  return remember(r, r.displayName || '', 'password');
}

export async function signUpWithEmail(name, email, password) {
  const r = await emailCall('accounts:signUp', email, password);
  if (name.trim()) {
    try { await fb.postJson(`${IDENTITY}/accounts:update?key=${FIREBASE.apiKey}`, { idToken: r.idToken, displayName: name.trim() }); } catch {}
  }
  return remember(r, name.trim(), 'password');
}

export async function sendPasswordReset(email) {
  try {
    await fb.postJson(`${IDENTITY}/accounts:sendOobCode?key=${FIREBASE.apiKey}`, { requestType: 'PASSWORD_RESET', email: email.trim() });
  } catch (e) {
    throw new Error(friendly(e.message));
  }
}

export function signOut() {
  saved = null;
  idToken = null;
  store.remove('account');
  changed();
}

/** A valid Firebase ID token, refreshed when it's about to run out. */
export async function token() {
  if (idToken && Date.now() < idTokenExpires - 60000) return idToken;
  if (!saved || !saved.refresh) throw new Error('Not signed in');
  let r;
  try {
    r = await fb.postForm(`${SECURE_TOKEN}/token?key=${FIREBASE.apiKey}`, { grant_type: 'refresh_token', refresh_token: saved.refresh });
  } catch (e) {
    // The account was removed or turned off: sign in again.
    if (e.code >= 400 && e.code <= 403) signOut();
    throw e;
  }
  saved = { ...saved, refresh: r.refresh_token };
  store.set('account', saved);
  idToken = r.id_token;
  idTokenExpires = Date.now() + Number(r.expires_in || 3600) * 1000;
  return idToken;
}

/**
 * Records this start in users/{uid} (Account.recordOpen). One account, one device: just after signing
 * in, this PC becomes the account's device; on later starts, if the account was since signed in
 * somewhere else, this PC is signed out. The owner's account is left alone on PC.
 */
export async function recordOpen() {
  const u = user();
  if (!u) return;
  try {
    const t = await token();
    const existing = await fb.get(`users/${u.uid}`, t);
    const claiming = !!saved.claim;
    const fields = {
      name: u.name, email: u.email, lastOpened: new Date(), appVersion: `PC ${BUILD.version}`,
      device: 'PC', model: deviceName, signIn: usesPassword() ? 'Email' : 'Google',
    };
    if (!isAdmin()) {
      const accountDevice = existing?.deviceId || '';
      const second = existing?.deviceId2 || '';
      const two = plans.twoDevices();
      const known = accountDevice === deviceId || (two && second === deviceId);
      if (!claiming && accountDevice && !known) {
        signOut();
        noticeText = 'Your account is now being used on another device. A free account works on one device at a time. Sign in again to watch here.';
        changed();
        return;
      }
      fields.deviceId = deviceId;
      if (!claiming && two && second === deviceId && accountDevice !== deviceId) delete fields.deviceId;
      if (two && claiming && accountDevice && accountDevice !== deviceId) fields.deviceId2 = accountDevice;
    }
    if (!existing) fields.joined = new Date();
    await fb.patch(`users/${u.uid}`, fields, t);
    if (claiming) { saved = { ...saved, claim: false }; store.set('account', saved); }
  } catch {}
}

/** Sends the viewing and sponsor totals for the owner's stats page (Account.reportViewing). */
export async function reportViewing(sponsorViews) {
  const u = user();
  if (!u) return;
  const watched = Object.fromEntries(watching.totals());
  const used = features.totals();
  const days = [...new Set([...Object.keys(watched), ...Object.keys(used)])].sort()
    .map((d) => [d, watched[d] || { channels: {}, programmes: {}, hours: {} }])
    .filter(([d, t]) => Object.keys(t.channels).length || Object.keys(t.programmes).length || Object.keys(used[d] || {}).length);
  const now = watching.now();
  const todayKey = today(Date.now());
  const sponsorDays = sponsorViews.totals().filter(([, m]) => Object.keys(m).length);
  if (!days.length && !sponsorDays.length) return;
  try {
    const t = await token();
    for (const [day, sponsors] of sponsorDays) {
      await fb.patch(`sponsorViews/${day}_${u.uid}`, { uid: u.uid, day, device: 'PC', sponsors, updated: new Date() }, t);
      sponsorViews.sent(day);
    }
    for (const [day, totals] of days) {
      const ch = totals.channels;
      const fields = {
        uid: u.uid, day, device: 'PC', appVersion: `PC ${BUILD.version}`,
        seconds: Object.values(ch).reduce((a, e) => a + e.s, 0), channels: ch, updated: new Date(),
      };
      if (Object.keys(totals.programmes).length) {
        fields.programmes = totals.programmes;
        fields.hours = Object.fromEntries(Object.entries(totals.hours).map(([k, v]) => [k.replace('|', '_'), v]));
      }
      // Which parts of the app were used, and on today's record the channel on now (Account.reportViewing).
      if (Object.keys(used[day] || {}).length) fields.features = used[day];
      if (day === todayKey && now) { fields.nowName = now.name; fields.nowAt = new Date(now.at); fields.nowLive = now.live; }
      await fb.patch(`usage/${day}_${u.uid}`, fields, t);
      watching.sent(day);
      features.sent(day);
    }
  } catch {}
}
