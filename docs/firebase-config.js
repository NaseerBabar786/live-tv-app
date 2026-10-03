// The Live TV Firebase project (public values; access is controlled by the Firestore rules).
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
};
// Sees the user dashboard and can delete any Suggestions post.
export const ADMIN_EMAIL = "";
export const configured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);
