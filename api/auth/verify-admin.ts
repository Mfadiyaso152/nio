import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

const ADMIN_EMAIL = 'mfb.15.f@gmail.com';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: Record<string, string> | null = null;
let certsExpiresAt = 0;

function getFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        projectId?: string;
      };
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
    // fallback below
  }
  return 'citric-phenomenon-f7854';
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < certsExpiresAt) {
    return cachedCerts;
  }

  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google certs (${response.status})`);
  }

  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;

  const certs = (await response.json()) as Record<string, string>;
  cachedCerts = certs;
  certsExpiresAt = now + maxAgeMs;
  return certs;
}

interface FirebaseJwtPayload extends jwt.JwtPayload {
  email?: string;
  email_verified?: boolean;
  auth_time?: number;
  user_id?: string;
}

async function verifyFirebaseToken(token: string, projectId: string): Promise<FirebaseJwtPayload> {
  const decodedComplete = jwt.decode(token, { complete: true });
  if (
    !decodedComplete ||
    typeof decodedComplete === 'string' ||
    !decodedComplete.header?.kid ||
    decodedComplete.header.alg !== 'RS256'
  ) {
    throw new Error('Malformed JWT header');
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[decodedComplete.header.kid];
  if (!cert) {
    // Force refresh once in case keys rotated
    cachedCerts = null;
    const freshCerts = await getGooglePublicCerts();
    const freshCert = freshCerts[decodedComplete.header.kid];
    if (!freshCert) {
      throw new Error('Unknown signing key ID');
    }
    return verifyWithCert(token, freshCert, projectId);
  }

  return verifyWithCert(token, cert, projectId);
}

function verifyWithCert(token: string, cert: string, projectId: string): FirebaseJwtPayload {
  const verified = jwt.verify(token, cert, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    clockTolerance: 30,
  }) as FirebaseJwtPayload;

  if (!verified.sub || typeof verified.sub !== 'string' || verified.sub.length > 128) {
    throw new Error('Invalid subject claim');
  }

  return verified;
}

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

  const rawHeader = req.headers.authorization || req.headers.Authorization;
  const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ authorized: false, error: 'Missing Authorization Bearer token' });
    return;
  }

  try {
    const projectId = getFirebaseProjectId();
    const decoded = await verifyFirebaseToken(token, projectId);

    const isAuthorized =
      decoded.email_verified === true &&
      decoded.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    if (!isAuthorized) {
      res.status(403).json({
        authorized: false,
        email: decoded.email || null,
        error: 'الحساب غير مصرح له بإدارة منصة نيو.',
      });
      return;
    }

    res.status(200).json({
      authorized: true,
      uid: decoded.sub,
      email: decoded.email,
    });
  } catch (err) {
    console.error('Admin token verification error:', err);
    res.status(401).json({ authorized: false, error: 'تعذر التحقق من صلاحية رمز الجلسة.' });
  }
}
