/**
 * Firebase (client) — SaloonX uses Firebase Authentication (email/password)
 * as THE identity provider. The web config below is public by design
 * (it ships in the client bundle); security is enforced by Auth rules +
 * our server-side session layer, never by hiding this config.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"

export const firebaseConfig = {
  apiKey: "AIzaSyDymn4bmAZQVm4E7lDN7PDdP96_G0Vf_IU",
  authDomain: "saloonxpro.firebaseapp.com",
  projectId: "saloonxpro",
  storageBucket: "saloonxpro.firebasestorage.app",
  messagingSenderId: "424390531903",
  appId: "1:424390531903:web:7ed693317affebc784d18a",
  measurementId: "G-JBG7RK6MME",
}

/** The primary app instance (the signed-in user's session). */
function getApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig)
}

/** Firebase Auth bound to the primary app. */
export function firebaseAuth(): Auth {
  return getAuth(getApp())
}
