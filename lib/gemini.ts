import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import { getSetting, writableDir } from './settings';

// AI Studio (free tier) model — supports image output via responseModalities
const AI_STUDIO_MODEL = 'gemini-2.0-flash-preview-image-generation';
// Vertex AI model (paid / service account)
const VERTEX_MODEL = 'gemini-2.5-flash-image';

export interface GenerateImageParams {
  prompt: string;
  /** SKU's existing main product photo (URL or base64 data URI). Omit for text-only generation. */
  referenceImageUrl?: string;
  /** Optional style reference: in-memory bytes + mime. */
  styleReference?: {
    base64: string;
    mimeType: string;
  };
}

export interface GenerateImageResult {
  imageBytes: Buffer;
  mimeType: string;
  modelVersion: string;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly scope: 'per_minute' | 'per_day' | 'unknown',
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class GenerationBlockedError extends Error {
  constructor(message: string, public readonly reason?: string) {
    super(message);
    this.name = 'GenerationBlockedError';
  }
}

export class AccessError extends Error {
  constructor(message: string, public readonly hint?: string) {
    super(message);
    this.name = 'AccessError';
  }
}

/**
 * Resolve the path to the GCP credentials JSON file.
 * If GCP_CREDENTIALS_JSON env var is set (raw JSON or base64), write it to /tmp
 * and return that path — this is the Vercel/serverless deployment pattern.
 */
function resolveCredentialsPath(): string | undefined {
  const inline = process.env.GCP_CREDENTIALS_JSON;
  if (inline) {
    const tmpPath = join(writableDir(), 'gcp-credentials.json');
    if (!existsSync(tmpPath)) {
      let json = inline;
      try {
        const decoded = Buffer.from(inline, 'base64').toString('utf8');
        JSON.parse(decoded);
        json = decoded;
      } catch { /* not base64, use as-is */ }
      writeFileSync(tmpPath, json, 'utf8');
    }
    return tmpPath;
  }
  const configured = getSetting('GOOGLE_APPLICATION_CREDENTIALS');
  if (!configured) return undefined;
  if (configured.startsWith('.')) {
    return join(writableDir(), configured.replace(/^\.\//, ''));
  }
  return configured;
}

export class GeminiImageClient {
  private apiKey: string | undefined;
  private auth: GoogleAuth | undefined;
  private projectId: string | undefined;
  private region: string;

  constructor() {
    this.apiKey = getSetting('GEMINI_API_KEY');
    this.region = getSetting('GCP_REGION') || 'us-central1';

    if (!this.apiKey) {
      // Fall back to Vertex AI
      const projectId = getSetting('GCP_PROJECT_ID');
      const credPath = resolveCredentialsPath();

      if (!projectId) {
        throw new Error(
          'No GEMINI_API_KEY set. Alternatively, configure GCP_PROJECT_ID + credentials in Settings.'
        );
      }
      if (!credPath) {
        throw new Error(
          'No GEMINI_API_KEY set. Alternatively, upload a GCP service account JSON in Settings.'
        );
      }

      this.projectId = projectId;
      this.auth = new GoogleAuth({
        keyFile: credPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }
  }

  async generate({
    prompt,
    referenceImageUrl,
    styleReference,
  }: GenerateImageParams): Promise<GenerateImageResult> {
    const parts: Record<string, unknown>[] = [{ text: prompt }];

    if (referenceImageUrl) {
      let productBase64: string;
      let productMime: string;

      if (referenceImageUrl.startsWith('data:')) {
        const [header, data] = referenceImageUrl.split(',');
        productBase64 = data;
        productMime = header.replace('data:', '').replace(';base64', '');
      } else {
        const refResponse = await axios.get<ArrayBuffer>(referenceImageUrl, {
          responseType: 'arraybuffer',
          timeout: 30_000,
        });
        productBase64 = Buffer.from(refResponse.data).toString('base64');
        productMime = refResponse.headers['content-type']?.toString() || 'image/jpeg';
      }

      parts.push({ inlineData: { mimeType: productMime, data: productBase64 } });
    }

    if (styleReference) {
      parts.push({
        inlineData: {
          mimeType: styleReference.mimeType,
          data: styleReference.base64,
        },
      });
    }

    if (this.apiKey) {
      return this.generateViaAiStudio(parts);
    }
    return this.generateViaVertex(parts);
  }

  private async generateViaAiStudio(parts: Record<string, unknown>[]): Promise<GenerateImageResult> {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${AI_STUDIO_MODEL}:generateContent?key=${this.apiKey}`;

    let response;
    try {
      response = await axios.post(
        endpoint,
        {
          contents: [{ role: 'user', parts }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 120_000 }
      );
    } catch (err: unknown) {
      throw this.classifyError(err, 'AI Studio');
    }

    return this.extractImage(response.data, AI_STUDIO_MODEL, 'AI Studio');
  }

  private async generateViaVertex(parts: Record<string, unknown>[]): Promise<GenerateImageResult> {
    const client = await this.auth!.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    if (!token) {
      throw new AccessError(
        'Could not obtain access token from service account',
        'Verify that GOOGLE_APPLICATION_CREDENTIALS points to a valid JSON key file ' +
        'and that the service account has the "Vertex AI User" role.'
      );
    }

    const endpoint =
      `https://${this.region}-aiplatform.googleapis.com/v1/` +
      `projects/${this.projectId}/locations/${this.region}/` +
      `publishers/google/models/${VERTEX_MODEL}:generateContent`;

    let response;
    try {
      response = await axios.post(
        endpoint,
        { contents: [{ role: 'user', parts }] },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 120_000,
        }
      );
    } catch (err: unknown) {
      throw this.classifyError(err, 'Vertex AI');
    }

    return this.extractImage(response.data, VERTEX_MODEL, 'Vertex AI');
  }

  private extractImage(data: Record<string, unknown>, modelId: string, backend: string): GenerateImageResult {
    const candidate = (data?.candidates as Record<string, unknown>[])?.[0];
    const finishReason = candidate?.finishReason as string | undefined;

    if (finishReason && finishReason !== 'STOP') {
      throw new GenerationBlockedError(`Generation stopped with reason: ${finishReason}`, finishReason);
    }

    const responseParts = (candidate?.content as Record<string, unknown>)?.parts as Record<string, unknown>[] ?? [];
    for (const part of responseParts) {
      const inlineData = part.inlineData as Record<string, string> | undefined;
      if (inlineData?.data) {
        return {
          imageBytes: Buffer.from(inlineData.data, 'base64'),
          mimeType: inlineData.mimeType || 'image/png',
          modelVersion: modelId,
        };
      }
    }

    throw new Error(
      `${backend} returned no image data. ` +
      `Text response (if any): ${responseParts.map((p) => p.text).filter(Boolean).join(' ') || '(none)'}`
    );
  }

  private classifyError(err: unknown, backend: string): Error {
    const e = err as { response?: { status: number; data?: { error?: { message?: string } } }; message?: string };
    const status = e?.response?.status;
    const data = e?.response?.data;
    const message = data?.error?.message ?? e?.message ?? String(err);

    if (status === 429) {
      const scope: 'per_minute' | 'per_day' | 'unknown' =
        /per[\s_-]?day|daily/i.test(message) ? 'per_day'
        : /per[\s_-]?minute|RPM/i.test(message) ? 'per_minute'
        : 'unknown';
      return new RateLimitError(message, scope);
    }

    if (status === 401 || status === 403) {
      let hint = `Check your ${backend} credentials/permissions.`;
      if (/billing/i.test(message)) {
        hint = 'Billing may not be enabled on your GCP project.';
      } else if (/permission|forbidden/i.test(message)) {
        hint = backend === 'Vertex AI'
          ? 'Service account is missing the "Vertex AI User" role.'
          : 'Check that your GEMINI_API_KEY is valid and not expired.';
      }
      return new AccessError(`${status}: ${message}`, hint);
    }

    if (status === 404 || /model.*not.*found|not.*available.*region/i.test(message)) {
      return new AccessError(
        message,
        backend === 'Vertex AI'
          ? `Model may not be available in region ${this.region}. Try us-central1.`
          : `Model ${AI_STUDIO_MODEL} may not be available yet. Check aistudio.google.com.`
      );
    }

    if (status === 400) {
      return new AccessError(`400 Bad Request: ${message}`);
    }

    return err instanceof Error ? err : new Error(message);
  }
}
