import crypto from 'crypto';
import JSZip from 'jszip';
import forge from 'node-forge';

const MINIMAL_PASS_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk2M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==',
  'base64'
);

function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

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

interface VercelReq {
  method?: string;
  body?: WalletTicketPayload;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  send: (body: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const configured = Boolean(
    process.env.APPLE_PASS_TYPE_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_WALLET_CERT_PEM &&
      process.env.APPLE_WALLET_KEY_PEM &&
      process.env.APPLE_WALLET_WWDR_PEM
  );

  if (!configured) {
    res.status(503).json({
      configured: false,
      error: 'Apple Wallet signing certificates are not configured on the server.',
    });
    return;
  }

  const body = req.body;
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
        primaryFields: [{ key: 'event', label: 'المناسبة', value: body.eventTitle }],
        secondaryFields: [
          { key: 'guest', label: 'المدعو', value: body.guestDisplay },
          { key: 'seats', label: 'عدد الحضور', value: String(body.attendingCount || 1) },
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

    const cert = forge.pki.certificateFromPem(normalizePem(process.env.APPLE_WALLET_CERT_PEM || ''));
    const wwdr = forge.pki.certificateFromPem(normalizePem(process.env.APPLE_WALLET_WWDR_PEM || ''));
    const privateKey = forge.pki.privateKeyFromPem(
      normalizePem(process.env.APPLE_WALLET_KEY_PEM || '')
    );

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
    const signatureBuf = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');

    const zip = new JSZip();
    for (const [name, buf] of Object.entries(files)) {
      zip.file(name, buf);
    }
    zip.file('manifest.json', manifestBuf);
    zip.file('signature', signatureBuf);

    const pkpassBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="nio-${body.qrToken}.pkpass"`);
    res.status(200).send(pkpassBuffer);
  } catch (err) {
    console.error('Apple Wallet signing error:', err);
    res.status(500).json({ error: 'Failed to sign Apple Wallet pass' });
  }
}
