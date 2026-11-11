import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { app } from './config';

export const auth = getAuth(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

let signInPromise = null;

export function ensureSignedIn() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .catch((error) => {
        signInPromise = null;
        throw error;
      });
  }

  return signInPromise;
}