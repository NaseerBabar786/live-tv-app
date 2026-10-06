// The Cable TV Firebase project (public values; access is controlled by the Firestore rules).
export const firebaseConfig = {
  apiKey: "AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE",
  authDomain: "live-tv-b2164.firebaseapp.com",
  projectId: "live-tv-b2164",
};
// Sees the user dashboard and can delete any Suggestions post.
export const ADMIN_EMAIL = "naseerahmadbabar@gmail.com";
export const configured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);
