// The owner's Firebase project (FirebaseConfig.kt). These values are public by design: they ship inside
// the apps and the website; the Firestore rules decide who reads and writes what.
import { BUILD } from './shared/build.js';

export const FIREBASE = {
  apiKey: 'AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE',
  projectId: 'live-tv-b2164',
  /** The "TVs and Limited Input devices" OAuth client: the code shown for Google sign-in. */
  tvClientId: '18909235292-g5q34838eh2aqu56jra9600dh1r3c2st.apps.googleusercontent.com',
  /** Added at build time from the TV_CLIENT_SECRET repository secret (empty in local builds). */
  tvClientSecret: BUILD.tvClientSecret || '',
  adminEmail: 'naseerahmadbabar@gmail.com',
};

/** Sign-in is required only once the project is set up (Google sign-in can't work without the secret). */
export const signInConfigured = () => !!FIREBASE.tvClientSecret;

export const APP_NAME = 'Cable TV';
export { BUILD };
