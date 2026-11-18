interface VercelReq {
  method?: string;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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

  res.status(200).json({ apple, google, samsung });
}
