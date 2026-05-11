import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import { getSetting } from './settings';

const MODEL_ID = 'gemini-2.5-flash-image';

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

export class GeminiImageClient {
  private auth: GoogleAuth;
  private projectId: string;
  private region: string;

  constructor() {
    const projectId = getSetting('GCP_PROJECT_ID');
    const region = getSetting('GCP_REGION') || 'us-central1';
    const credPath = getSetting('GOOGLE_APPLICATION_CREDENTIALS');

    if (!projectId) {
      throw new Error(
        'GCP_PROJECT_ID is not configured. Add it in Settings or .env.local'
      );
    }
    if (!credPath) {
      throw new Error(
        'GOOGLE_APPLICATION_CREDENTIALS is not configured. Upload your credentials JSON in Settings'
      );
    }

    this.projectId = projectId;
    this.region = region;
    this.auth = new GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
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

    const endpoint =
      `https://${this.region}-aiplatform.googleapis.com/v1/` +
      `projects/${this.projectId}/locations/${this.region}/` +
      `publishers/google/models/${MODEL_ID}:generateContent`;

    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    if (!token) {
      throw new AccessError(
        'Could not obtain access token from service account',
        'Verify that GOOGLE_APPLICATION_CREDENTIALS points to a valid JSON key file ' +
        'and that the service account has the "Vertex AI User" role.'
      );
    }

    let response;
    try {
      response = await axios.post(
        endpoint,
        { contents: [{ role: 'user', parts }] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 120_000,
        }
      );
    } catch (err: unknown) {
      throw this.classifyError(err);
    }

    const candidate = response.data?.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason && finishReason !== 'STOP') {
      throw new GenerationBlockedError(
        `Generation stopped with reason: ${finishReason}`,
        finishReason
      );
    }

    const responseParts = candidate?.content?.parts ?? [];
    for (const part of responseParts) {
      if (part.inlineData?.data) {
        return {
          imageBytes: Buffer.from(part.inlineData.data, 'base64'),
          mimeType: part.inlineData.mimeType || 'image/png',
          modelVersion: MODEL_ID,
        };
      }
    }

    throw new Error(
      'Vertex returned no image data. ' +
      `Text response (if any): ${responseParts.map((p: Record<string, unknown>) => p.text).filter(Boolean).join(' ') || '(none)'}`
    );
  }

  private classifyError(err: unknown): Error {
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
      let hint = 'Check service account roles in GCP Console.';
      if (/billing/i.test(message)) {
        hint = 'Billing may not be enabled. Visit https://console.cloud.google.com/billing';
      } else if (/permission|forbidden/i.test(message)) {
        hint = 'Service account is missing the "Vertex AI User" role.';
      }
      return new AccessError(`${status}: ${message}`, hint);
    }

    if (status === 404 || /model.*not.*found|not.*available.*region/i.test(message)) {
      return new AccessError(
        message,
        `Model ${MODEL_ID} may not be available in region ${this.region}. ` +
        `Try GCP_REGION=us-central1.`
      );
    }

    if (status === 400) {
      return new AccessError(`400 Bad Request: ${message}`);
    }

    return err instanceof Error ? err : new Error(message);
  }
}
