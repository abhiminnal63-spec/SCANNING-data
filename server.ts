import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Allow large payloads for high-resolution ID card images
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Initialize Google GenAI with recommended telemetry header
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

console.log(`[ID Card Scanner Server] Initializing on port ${PORT}...`);
if (!apiKey) {
  console.warn('[ID Card Scanner Server] WARNING: GEMINI_API_KEY environment variable is not set. Gemini API calls will fail.');
}

/**
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    appName: 'ID Card Scanner',
    timestamp: new Date().toISOString(),
    hasApiKey: Boolean(apiKey),
    engine: 'Gemini 3.8 Flash Vision Document Extractor',
  });
});

/**
 * Main ID Card Analysis Endpoint
 * Receives the processed, enhanced card image in base64.
 */
app.post('/api/scan-id', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { imageBase64, mimeType = 'image/jpeg', orientation = 'horizontal' } = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({
        success: false,
        error: 'No image data provided. Please provide imageBase64 string.',
        errorType: 'INVALID_ARGUMENT',
      });
      return;
    }

    if (!apiKey) {
      console.error('[Gemini Service] Missing GEMINI_API_KEY');
      res.status(500).json({
        success: false,
        error: 'Scanner configuration error: GEMINI_API_KEY is not configured.',
        errorType: 'AUTH_ERROR',
      });
      return;
    }

    // Clean base64 data: strip any accidental data URL prefix
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9+]+;base64,/, '').trim();
    if (!cleanBase64) {
      res.status(400).json({
        success: false,
        error: 'Invalid or empty base64 image data.',
        errorType: 'INVALID_ARGUMENT',
      });
      return;
    }

    // Validate MIME type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const normalizedMime = validMimes.includes(mimeType) ? mimeType : 'image/jpeg';

    const promptText = `You are an ID-card document understanding system.

Analyze the provided image carefully.

First determine whether the image actually contains an ID card.
A rectangular object alone is not sufficient evidence.
Distinguish a genuine ID card from a blanket, bedsheet, table, wall, book, notebook, laptop, mobile phone, box, paper, random photograph, or background object.

If there is no genuine ID card, return isIdCard=false with a brief clear reason.

If there is an ID card, determine its type dynamically.
Examples include School Student ID, College Student ID, University ID, Teacher ID, Faculty ID, Staff ID, Employee ID, Visitor ID, Hospital ID, Library ID, Membership Card, Government ID, or another appropriate category.

Read only information that is actually visible on the card.
Determine fields using the visual layout, labels, typography, and relationships between text.
Normalize common abbreviations into clear human-readable field names (for example: "Adm. No" -> "Admission Number", "Ph." or "Mob." -> "Phone Number", "Reg. No" -> "Register Number", "Roll No" -> "Roll Number", "D.O.B" -> "Date of Birth", "Bld Grp" -> "Blood Group").
For unlabelled fields like a prominent person's name beneath a photo or title, infer the field name semantically.

Extract all meaningful fields that are actually present.
Do not restrict extraction to a predefined field list.
Do not invent missing information. Never guess unreadable characters.
If a value cannot be reliably read, omit it or return an empty value.
Preserve phone numbers, ID numbers, admission numbers, register numbers, dates, blood groups, and similar values accurately.
Preserve addresses as complete, clean readable text.
Identify the institution or organization if clearly visible.

Also, detect if there is a printed photograph of the cardholder on the card.
If a printed cardholder photograph is present, return its normalized bounding box [ymin, xmin, ymax, xmax] as numbers between 0.0 and 1.0 relative to the image height and width. If no photograph is printed on the card, set photoBoundingBox to null.

Return your response strictly in the following JSON format:
{
  "isIdCard": true,
  "idCardType": "School Student ID",
  "confidence": 0.95,
  "institution": "Mar Thoma Higher Secondary School Valakom",
  "fields": [
    { "label": "Name", "value": "ABHINAV M" },
    { "label": "Class", "value": "VIII E" },
    { "label": "Phone Number", "value": "+919495036919" },
    { "label": "Address", "value": "Mahesan E, Cheruthitta, Puthen Veedu, Karickom PO, Kottarakara" },
    { "label": "Admission Number", "value": "16953" }
  ],
  "photoBoundingBox": {
    "ymin": 0.22,
    "xmin": 0.68,
    "ymax": 0.58,
    "xmax": 0.94
  }
}

If the image does not contain an ID card:
{
  "isIdCard": false,
  "reason": "The image shows a notebook / table, not a genuine ID card.",
  "fields": []
}

Do not return explanations.
Do not return markdown formatting.
Return only valid JSON.`;

    console.log(`[Gemini Service] Sending image (${cleanBase64.length} chars base64, mime: ${normalizedMime})...`);

    // Call Gemini with candidate models for high reliability
    let response: any = null;
    let lastError: any = null;
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

    for (const modelName of candidateModels) {
      try {
        console.log(`[Gemini Service] Trying model ${modelName}...`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: normalizedMime,
                  data: cleanBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
          },
        });
        if (response?.text) {
          console.log(`[Gemini Service] Success with ${modelName}`);
          break;
        }
      } catch (callErr: any) {
        lastError = callErr;
        const errMsg = callErr?.message || String(callErr);
        console.warn(`[Gemini Service] ${modelName} failed:`, errMsg);
      }
    }

    if (!response?.text && lastError) {
      throw lastError;
    }

    const responseText = response.text || '';
    console.log(`[Gemini Service] Response received (${responseText.length} chars).`);

    // Clean any accidental markdown wrappers like ```json ... ```
    let cleanedJson = responseText.trim();
    if (cleanedJson.startsWith('```json')) {
      cleanedJson = cleanedJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedJson.startsWith('```')) {
      cleanedJson = cleanedJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error('[Gemini Service] Failed to parse JSON response:', responseText);
      res.status(502).json({
        success: false,
        error: 'Unable to parse vision analysis response.',
        errorType: 'PARSE_ERROR',
        rawResponse: responseText,
      });
      return;
    }

    const isIdCard = Boolean(parsedResult.isIdCard);
    const idCardType = parsedResult.idCardType || (isIdCard ? 'ID Card' : 'Non-ID Object');
    const confidence = typeof parsedResult.confidence === 'number' ? parsedResult.confidence : (isIdCard ? 0.9 : 0.1);
    const institution = parsedResult.institution || null;
    const rawFields: any[] = Array.isArray(parsedResult.fields) ? parsedResult.fields : [];

    // Filter and sanitize fields (no empty labels/values, remove duplicates)
    const sanitizedFields = rawFields
      .filter((f) => f && typeof f.label === 'string' && f.label.trim() && f.value !== undefined && f.value !== null)
      .map((f) => ({
        label: String(f.label).trim(),
        value: String(f.value).trim(),
        category: categorizeField(String(f.label).trim()),
      }))
      .filter((f) => f.value.length > 0);

    // Crop printed photo if bounding box is provided
    let photoCropUrl: string | null = null;
    if (isIdCard && parsedResult.photoBoundingBox && typeof parsedResult.photoBoundingBox.ymin === 'number') {
      try {
        const imageBuffer = Buffer.from(cleanBase64, 'base64');
        const meta = await sharp(imageBuffer).metadata();
        const imgW = meta.width || (orientation === 'horizontal' ? 1000 : 630);
        const imgH = meta.height || (orientation === 'horizontal' ? 630 : 1000);

        const pb = parsedResult.photoBoundingBox;
        let ymin = pb.ymin;
        let xmin = pb.xmin;
        let ymax = pb.ymax;
        let xmax = pb.xmax;

        // If returned in pixel coordinates, convert to 0..1 range
        if (ymin > 1.0 || xmin > 1.0 || ymax > 1.0 || xmax > 1.0) {
          ymin = ymin / imgH;
          xmin = xmin / imgW;
          ymax = ymax / imgH;
          xmax = xmax / imgW;
        }

        // Normalized 0..1 to pixel bounds with safe padding
        ymin = Math.max(0, Math.min(0.9, ymin));
        xmin = Math.max(0, Math.min(0.9, xmin));
        ymax = Math.max(ymin + 0.05, Math.min(1.0, ymax));
        xmax = Math.max(xmin + 0.05, Math.min(1.0, xmax));

        const marginX = (xmax - xmin) * 0.04;
        const marginY = (ymax - ymin) * 0.04;

        const left = Math.round(Math.max(0, (xmin - marginX) * imgW));
        const top = Math.round(Math.max(0, (ymin - marginY) * imgH));
        const width = Math.round(Math.min(imgW - left, (xmax - xmin + marginX * 2) * imgW));
        const height = Math.round(Math.min(imgH - top, (ymax - ymin + marginY * 2) * imgH));

        if (width > 20 && height > 20) {
          const croppedBuffer = await sharp(imageBuffer)
            .extract({ left, top, width, height })
            .resize({ width: 320, withoutEnlargement: false })
            .jpeg({ quality: 92 })
            .toBuffer();

          photoCropUrl = `data:image/jpeg;base64,${croppedBuffer.toString('base64')}`;
        }
      } catch (cropErr) {
        console.warn('[Gemini Service] Server photo crop failed (client fallback will handle):', cropErr);
      }
    }

    const processingTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      result: {
        isIdCard,
        idCardType,
        confidence,
        institution,
        fields: sanitizedFields,
        photoBoundingBox: parsedResult.photoBoundingBox || null,
        photoCropUrl,
        reason: parsedResult.reason || (isIdCard ? undefined : 'No valid ID card features detected on object.'),
        orientation,
        processingTimeMs,
      },
    });
  } catch (err: any) {
    console.error('[Gemini Service] API Error:', err);
    // Print detailed error info for dev debugging
    const errorMessage = err?.message || String(err);
    const isInvalidArgument = errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('400');
    const isAuthError = errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('403') || errorMessage.includes('PERMISSION_DENIED');

    let userMessage = 'Unable to process this image.';
    let errorType = 'UNKNOWN_ERROR';

    if (isInvalidArgument) {
      userMessage = 'Unable to process this image.';
      errorType = 'INVALID_ARGUMENT';
    } else if (isAuthError) {
      userMessage = 'Scanner configuration error.';
      errorType = 'AUTH_ERROR';
    } else if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      userMessage = 'Network error. Check your connection.';
      errorType = 'NETWORK_ERROR';
    }

    res.status(500).json({
      success: false,
      error: userMessage,
      errorType,
      detail: errorMessage,
    });
  }
});

/**
 * Assigns functional category for clean UI grouping
 */
function categorizeField(label: string): 'personal' | 'academic' | 'employment' | 'contact' | 'identification' | 'other' {
  const l = label.toLowerCase();
  if (l.includes('name') || l.includes('dob') || l.includes('birth') || l.includes('blood') || l.includes('gender') || l.includes('father')) {
    return 'personal';
  }
  if (l.includes('class') || l.includes('roll') || l.includes('admission') || l.includes('adm') || l.includes('course') || l.includes('semester') || l.includes('batch') || l.includes('division') || l.includes('student')) {
    return 'academic';
  }
  if (l.includes('designation') || l.includes('department') || l.includes('employee') || l.includes('emp') || l.includes('faculty') || l.includes('staff') || l.includes('post')) {
    return 'employment';
  }
  if (l.includes('phone') || l.includes('mobile') || l.includes('contact') || l.includes('address') || l.includes('email') || l.includes('tel')) {
    return 'contact';
  }
  if (l.includes('id') || l.includes('register') || l.includes('reg') || l.includes('number') || l.includes('no') || l.includes('valid') || l.includes('expiry') || l.includes('issue')) {
    return 'identification';
  }
  return 'other';
}

/**
 * Vite integration & Server starter
 */
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ID Card Scanner] Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[ID Card Scanner] Startup failed:', err);
  process.exit(1);
});
