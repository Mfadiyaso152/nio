import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const ADMIN_EMAIL = 'mfb.15.f@gmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Client is offline.');
    }
  }
}

export async function signInWithGoogleAdmin() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutAdmin() {
  return signOut(auth);
}

export function isAuthorizedAdminUser(
  user: { email?: string | null; emailVerified?: boolean } | null
): boolean {
  return Boolean(
    user &&
      user.emailVerified === true &&
      user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

export async function verifyAdminOnServer(user: User | null): Promise<{
  authorized: boolean;
  email?: string | null;
  error?: string;
}> {
  if (!user) {
    return { authorized: false, error: 'لم يتم تسجيل الدخول.' };
  }
  try {
    const idToken = await user.getIdToken(true);
    const res = await fetch('/api/auth/verify-admin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    const rawText = await res.text();
    let data: {
      authorized?: boolean;
      email?: string | null;
      error?: string;
    } = {};
    try {
      data = rawText ? (JSON.parse(rawText) as typeof data) : {};
    } catch {
      console.error('Non-JSON verify-admin response:', res.status, rawText.slice(0, 200));
      return {
        authorized: false,
        email: user.email,
        error: `تعذر التحقق على الخادم (HTTP ${res.status}).`,
      };
    }

    if (!res.ok || !data.authorized) {
      return {
        authorized: false,
        email: data.email || user.email,
        error: data.error || `غير مصرح (${res.status})`,
      };
    }
    return { authorized: true, email: data.email || user.email };
  } catch (err) {
    console.error('verifyAdminOnServer network error:', err);
    return {
      authorized: false,
      email: user.email,
      error: 'تعذر الاتصال بخادم التحقق، يرجى المحاولة مجدداً.',
    };
  }
}
