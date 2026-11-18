import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const ADMIN_EMAIL = 'mfb.15.f@gmail.com';

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
    });

const adminAuth = getAuth(adminApp);

interface VercelReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ authorized: false, error: 'Method not allowed' });
    return;
  }

  const rawHeader = req.headers.authorization;
  const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ authorized: false, error: 'Missing Authorization Bearer token' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const isAuthorized =
      decoded.email_verified === true &&
      decoded.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    if (!isAuthorized) {
      res.status(403).json({
        authorized: false,
        email: decoded.email || null,
        error: 'Account is not authorized for NIO administration',
      });
      return;
    }

    res.status(200).json({
      authorized: true,
      uid: decoded.uid,
      email: decoded.email,
    });
  } catch {
    res.status(401).json({ authorized: false, error: 'Invalid or expired ID token' });
  }
}
