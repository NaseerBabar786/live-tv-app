// Firebase over its REST API, the same calls as the TV app's Http and Firestore objects (Account.kt).
import { FIREBASE } from './config.js';

export class HttpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function request(method, url, { body, form, bearer } = {}) {
  const headers = {};
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let payload;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  let r;
  try {
    r = await fetch(url, { method, headers, body: payload, cache: 'no-store', signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await r.text();
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const e = JSON.parse(text).error;
      // OAuth errors are a plain code such as "authorization_pending".
      msg = typeof e === 'string' ? e : (e && e.message) || msg;
    } catch {}
    throw new HttpError(r.status, msg);
  }
  return text ? JSON.parse(text) : {};
}

export const postJson = (url, body, bearer) => request('POST', url, { body, bearer });
export const postForm = (url, form) => request('POST', url, { form });

const base = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
export const doc = (path) => `${base()}/${path}`;

/** Firestore values to plain ones, and back (Firestore.encode). */
export function encode(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = value(v);
  return out;
}
function value(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v && typeof v === 'object') return { mapValue: { fields: encode(v) } };
  return { stringValue: String(v ?? '') };
}
export function decode(f) {
  if (!f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return new Date(f.timestampValue);
  if ('mapValue' in f) return fields(f.mapValue);
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(decode);
  return null;
}
export function fields(docJson) {
  const out = {};
  for (const [k, v] of Object.entries((docJson && docJson.fields) || {})) out[k] = decode(v);
  return out;
}

/** The document at [path] as plain fields, or null when there is none. */
export async function get(path, token) {
  try {
    return fields(await request('GET', doc(path), { bearer: token }));
  } catch (e) {
    if (e.code === 404) return null;
    throw e;
  }
}

/** Sets [data]'s fields on the document at [path], leaving its other fields as they are. */
export async function patch(path, data, token) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  await request('PATCH', `${doc(path)}?${mask}`, { body: { fields: encode(data) }, bearer: token });
}

/** Documents of [collection], ordered by [orderBy] (Firestore.list); [[id, fields]]. */
export async function list(collection, { limit = 50, token, orderBy, newestFirst = false } = {}) {
  const q = { from: [{ collectionId: collection }], limit };
  if (orderBy) q.orderBy = [{ field: { fieldPath: orderBy }, direction: newestFirst ? 'DESCENDING' : 'ASCENDING' }];
  const arr = await request('POST', `${base()}:runQuery`, { body: { structuredQuery: q }, bearer: token });
  return arr.filter((x) => x.document).map((x) => [x.document.name.split('/').pop(), fields(x.document)]);
}

/** The document at [path] as Firestore returns it (with its updateTime), or null when there is none. */
export async function getRaw(path, token) {
  try {
    return await request('GET', doc(path), { bearer: token });
  } catch (e) {
    if (e.code === 404) return null;
    throw e;
  }
}

/** A document's full name, for [commit] (Firestore.name). */
export const name = (path) => `projects/${FIREBASE.projectId}/databases/(default)/documents/${path}`;

/** Several writes saved together or not at all (Firestore.commit). */
export async function commit(writes, token) {
  await request('POST', `${base()}:commit`, { body: { writes }, bearer: token });
}
