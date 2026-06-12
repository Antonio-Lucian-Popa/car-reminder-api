import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { env } from '../../config/env';

export const ocrRouter = Router();
ocrRouter.use(requireAuth);

const ocrRateLimit = rateLimit({ windowMs: 60 * 1000, limit: 30, keyGenerator: (req) => req.user!.id });

const ocrRequestSchema = z.object({
  body: z.object({ imageUrl: z.string().min(1) }),
});

// Zod schema to validate the OCR JSON response from Claude
const ocrResultSchema = z.object({
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  date: z.string().nullable(),
  merchant: z.string().nullable(),
  cif: z.string().nullable(),
  category: z.enum(['COMBUSTIBIL', 'MASA', 'CAZARE', 'TRANSPORT', 'ALTELE']).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

type OcrResult = z.infer<typeof ocrResultSchema>;

const EMPTY_RESULT: OcrResult = {
  amount: null,
  currency: null,
  date: null,
  merchant: null,
  cif: null,
  category: null,
  confidence: 'low',
};

function imageUrlToLocalPath(imageUrl: string): string | null {
  try {
    const publicBase = env.PUBLIC_URL.replace(/\/$/, '');
    const relative = imageUrl.replace(publicBase, '');
    // Strip /api/uploads prefix and resolve to cwd/uploads/...
    const withoutPrefix = relative.replace(/^\/api\/uploads/, '');
    return path.join(process.cwd(), 'uploads', withoutPrefix);
  } catch {
    return null;
  }
}

ocrRouter.post('/receipt', ocrRateLimit, validate(ocrRequestSchema), async (req, res) => {
  if (!env.ANTHROPIC_API_KEY) {
    return res.json({ ...EMPTY_RESULT, error: 'OCR not configured' });
  }

  const { imageUrl } = req.body as { imageUrl: string };
  const localPath = imageUrlToLocalPath(imageUrl);

  if (!localPath || !fs.existsSync(localPath)) {
    return res.json(EMPTY_RESULT);
  }

  try {
    const imageBuffer = fs.readFileSync(localPath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(localPath).toLowerCase().replace('.', '');
    const mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}` as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            {
              type: 'text',
              text: `Acesta este un bon fiscal românesc. Extrage datele și returnează STRICT un obiect JSON valid (fără markdown, fără text suplimentar):
{
  "amount": <număr cu 2 zecimale sau null>,
  "currency": <"RON" sau altă monedă sau null>,
  "date": <"YYYY-MM-DD" sau null>,
  "merchant": <numele comerciantului sau null>,
  "cif": <CIF/CUI-ul comerciantului (format RO + cifre) sau null>,
  "category": <"COMBUSTIBIL"|"MASA"|"CAZARE"|"TRANSPORT"|"ALTELE" sau null>,
  "confidence": <"high"|"medium"|"low">
}
Indicii pentru categorie: benzinărie/combustibil→COMBUSTIBIL, restaurant/fast-food→MASA, hotel/cazare→CAZARE, taxi/transport→TRANSPORT.
Câmpurile "TVA", "TOTAL", "Total de plată" indică suma finală. CIF/CUI apare după "C.I.F." sau "C.U.I.".`,
            },
          ],
        },
      ],
    });

    const raw = (message.content[0] as { type: string; text: string }).text ?? '';
    // Strip possible ```json fences
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

    let parsed: OcrResult;
    try {
      const json = JSON.parse(cleaned);
      parsed = ocrResultSchema.parse(json);
    } catch {
      return res.json(EMPTY_RESULT);
    }

    return res.json(parsed);
  } catch {
    return res.json(EMPTY_RESULT);
  }
});
