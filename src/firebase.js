import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Configurazione web pubblica di Firebase (non è un segreto: l'accesso è protetto dalle regole Firestore)
const firebaseConfig = {
  apiKey: 'AIzaSyCsEnQm-ZqTWgh28Nx27xtFz62ln-E0FAM',
  authDomain: 'my-project-1516274864079.firebaseapp.com',
  projectId: 'my-project-1516274864079',
  appId: '1:260909537293:web:52beca863c06df44d8dd44',
  messagingSenderId: '260909537293',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Cache offline: l'app resta consultabile anche senza rete e riduce le letture (quota gratuita)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
