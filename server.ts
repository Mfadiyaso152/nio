import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import dotenv from 'dotenv';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import JSZip from 'jszip';
import forge from 'node-forge';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const ADMIN_EMAIL = 'mfb.15.f@gmail.com';
const PORT = Number(process.env.PORT || 3000);

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      projectId: firebaseConfig.projectId,
    });

const adminAuth = getAuth(adminApp);

function getWalletConfigStatus() {
  const apple = Boolean(
    process.env.APPLE_PASS_TYPE_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_WALLET_CERT_PEM &&
      process.env.APPLE_WALLET_KEY_PEM &&
      process.env.APPLE_WALLET_WWDR_PEM
  );
  const google = Boolean(
    process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SA_JSON
  );
  const samsung = Boolean(
    process.env.SAMSUNG_WALLET_PARTNER_ID &&
      process.env.SAMSUNG_WALLET_CARD_ID &&
      process.env.SAMSUNG_WALLET_PRIVATE_KEY
  );
  return { apple, google, samsung };
}

function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

// Minimal 1x1 charcoal PNG buffer for required Apple Wallet pass icon assets
const MINIMAL_PASS_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk2M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==',
  'base64'
);

interface WalletTicketPayload {
  qrToken: string;
  eventTitle: string;
  eventSlug: string;
  dateText: string;
  timeText: string;
  venueName: string;
  city?: string;
  guestDisplay: string;
  attendingCount: number;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Server-side Google OAuth / Firebase ID Token verification for Admin
  app.post('/api/auth/verify-admin', async (req, res) => {
    const authHeader = req.headers.authorization || '';
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

      res.json({
        authorized: true,
        uid: decoded.uid,
        email: decoded.email,
      });
    } catch {
      res.status(401).json({ authorized: false, error: 'Invalid or expired ID token' });
    }
  });

  // Check which official Wallet integrations are configured in server environment
  app.get('/api/wallet/status', (_req, res) => {
    res.json(getWalletConfigStatus());
  });

  // Apple Wallet (.pkpass) official signed generator
  app.post('/api/wallet/apple', async (req, res) => {
    const status = getWalletConfigStatus();
    if (!status.apple) {
      res.status(503).json({
        configured: false,
        error: 'Apple Wallet signing certificates are not configured on the server.',
      });
      return;
    }

    const body = req.body as WalletTicketPayload;
    if (!body?.qrToken || !body?.eventTitle) {
      res.status(400).json({ error: 'Missing required ticket payload' });
      return;
    }

    try {
      const passJson = {
        formatVersion: 1,
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
        teamIdentifier: process.env.APPLE_TEAM_ID,
        organizationName: process.env.APPLE_ORGANIZATION_NAME || 'NIO | نيو',
        serialNumber: body.qrToken,
        description: body.eventTitle,
        backgroundColor: 'rgb(52, 52, 61)',
        foregroundColor: 'rgb(255, 255, 255)',
        labelColor: 'rgb(203, 203, 214)',
        barcode: {
          message: body.qrToken,
          format: 'PKBarcodeFormatQR',
          messageEncoding: 'iso-8859-1',
          altText: body.qrToken,
        },
        barcodes: [
          {
            message: body.qrToken,
            format: 'PKBarcodeFormatQR',
            messageEncoding: 'iso-8859-1',
            altText: body.qrToken,
          },
        ],
        eventTicket: {
          primaryFields: [
            {
              key: 'event',
              label: 'المناسبة',
              value: body.eventTitle,
            },
          ],
          secondaryFields: [
            {
              key: 'guest',
              label: 'المدعو',
              value: body.guestDisplay,
            },
            {
              key: 'seats',
              label: 'عدد الحضور',
              value: String(body.attendingCount || 1),
            },
          ],
          auxiliaryFields: [
            {
              key: 'date',
              label: 'التاريخ والوقت',
              value: `${body.dateText} - ${body.timeText}`.trim(),
            },
            {
              key: 'venue',
              label: 'الموقع',
              value: `${body.venueName}${body.city ? ` - ${body.city}` : ''}`.trim(),
            },
          ],
        },
      };

      const files: Record<string, Buffer> = {
        'pass.json': Buffer.from(JSON.stringify(passJson, null, 2), 'utf-8'),
        'icon.png': MINIMAL_PASS_PNG,
        'icon@2x.png': MINIMAL_PASS_PNG,
        'logo.png': MINIMAL_PASS_PNG,
      };

      const manifest: Record<string, string> = {};
      for (const [name, buf] of Object.entries(files)) {
        manifest[name] = crypto.createHash('sha1').update(buf).digest('hex');
      }
      const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf-8');

      // PKCS#7 detached signature using node-forge
      const certPem = normalizePem(process.env.APPLE_WALLET_CERT_PEM || '');
      const keyPem = normalizePem(process.env.APPLE_WALLET_KEY_PEM || '');
      const wwdrPem = normalizePem(process.env.APPLE_WALLET_WWDR_PEM || '');

      const cert = forge.pki.certificateFromPem(certPem);
      const wwdr = forge.pki.certificateFromPem(wwdrPem);
      const privateKey = forge.pki.privateKeyFromPem(keyPem);

      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(manifestBuf.toString('binary'));
      p7.addCertificate(cert);
      p7.addCertificate(wwdr);
      p7.addSigner({
        key: privateKey,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
          { type: forge.pki.oids.messageDigest },
          { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
        ],
      });
      p7.sign({ detached: true });
      const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
      const signatureBuf = Buffer.from(der, 'binary');

      const zip = new JSZip();
      for (const [name, buf] of Object.entries(files)) {
        zip.file(name, buf);
      }
      zip.file('manifest.json', manifestBuf);
      zip.file('signature', signatureBuf);

      const pkpassBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="nio-${body.qrToken}.pkpass"`
      );
      res.send(pkpassBuffer);
    } catch (err) {
      console.error('Apple Wallet signing error:', err);
      res.status(500).json({ error: 'Failed to sign Apple Wallet pass' });
    }
  });

  // Google Wallet Event Ticket Save JWT generator
  app.post('/api/wallet/google', (req, res) => {
    const status = getWalletConfigStatus();
    if (!status.google) {
      res.status(503).json({
        configured: false,
        error: 'Google Wallet issuer credentials are not configured on the server.',
      });
      return;
    }

    const body = req.body as WalletTicketPayload;
    if (!body?.qrToken || !body?.eventTitle) {
      res.status(400).json({ error: 'Missing required ticket payload' });
      return;
    }

    try {
      const sa = JSON.parse(process.env.GOOGLE_WALLET_SA_JSON || '{}');
      const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
      const classId = `${issuerId}.nio_${body.eventSlug.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const objectId = `${issuerId}.${body.qrToken.replace(/[^a-zA-Z0-9_]/g, '_')}`;

      const claims = {
        iss: sa.client_email,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        payload: {
          eventTicketClasses: [
            {
              id: classId,
              issuerName: 'نيو | NIO',
              reviewStatus: 'UNDER_REVIEW',
              eventName: {
                defaultValue: { language: 'ar', value: body.eventTitle },
              },
              venue: {
                name: {
                  defaultValue: { language: 'ar', value: body.venueName || 'موقع الحفل' },
                },
                address: {
                  defaultValue: { language: 'ar', value: body.city || '' },
                },
              },
            },
          ],
          eventTicketObjects: [
            {
              id: objectId,
              classId,
              state: 'ACTIVE',
              ticketHolderName: body.guestDisplay,
              ticketNumber: body.qrToken,
              barcode: {
                type: 'QR_CODE',
                value: body.qrToken,
                alternateText: body.qrToken,
              },
            },
          ],
        },
      };

      const signedJwt = jwt.sign(claims, sa.private_key, { algorithm: 'RS256' });
      res.json({ saveUrl: `https://pay.google.com/gp/v/save/${signedJwt}` });
    } catch (err) {
      console.error('Google Wallet signing error:', err);
      res.status(500).json({ error: 'Failed to create Google Wallet pass link' });
    }
  });

  // Samsung Wallet Partner CData JWT generator
  app.post('/api/wallet/samsung', (req, res) => {
    const status = getWalletConfigStatus();
    if (!status.samsung) {
      res.status(503).json({
        configured: false,
        error: 'Samsung Wallet partner credentials are not configured on the server.',
      });
      return;
    }

    const body = req.body as WalletTicketPayload;
    if (!body?.qrToken || !body?.eventTitle) {
      res.status(400).json({ error: 'Missing required ticket payload' });
      return;
    }

    try {
      const partnerId = process.env.SAMSUNG_WALLET_PARTNER_ID;
      const cardId = process.env.SAMSUNG_WALLET_CARD_ID;
      const privateKey = normalizePem(process.env.SAMSUNG_WALLET_PRIVATE_KEY || '');

      const cdataPayload = {
        partnerId,
        cardId,
        refId: body.qrToken,
        createdAt: Date.now(),
        data: {
          eventTitle: body.eventTitle,
          holderName: body.guestDisplay,
          venue: body.venueName,
          dateTime: `${body.dateText} ${body.timeText}`,
          barcodeValue: body.qrToken,
        },
      };

      const signedCdata = jwt.sign(cdataPayload, privateKey, { algorithm: 'RS256' });
      res.json({
        walletUrl: `https://a.swallet.link/atw/v1/${cardId}#Clip?cdata=${encodeURIComponent(signedCdata)}`,
      });
    } catch (err) {
      console.error('Samsung Wallet signing error:', err);
      res.status(500).json({ error: 'Failed to create Samsung Wallet link' });
    }
  });

  // Vite middleware in dev, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NIO server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
