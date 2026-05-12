import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import { getSetting } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = getSetting('GEMINI_API_KEY');

  if (apiKey) {
    // Test via AI Studio (free tier) — no quota consumed for text-only call
    try {
      const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`;
      await axios.post(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK only.' }] }],
          generationConfig: { responseModalities: ['TEXT'] },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 }
      );
      return Response.json({ ok: true, backend: 'AI Studio (free tier)', region: 'global' });
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data?: { error?: { message?: string } } } };
      const status = e?.response?.status;
      const msg = e?.response?.data?.error?.message ?? (err instanceof Error ? err.message : String(err));
      return Response.json({
        ok: false,
        step: 'ai-studio',
        error: `${status ? `HTTP ${status}: ` : ''}${msg}`,
        hint: status === 403
          ? 'API key may be restricted. Check permissions at aistudio.google.com/apikey.'
          : 'Check that the API key is correct and the Generative Language API is enabled.',
      });
    }
  }

  // Fall back to Vertex AI
  const projectId = getSetting('GCP_PROJECT_ID');
  const region = getSetting('GCP_REGION') || 'us-central1';
  const credPath = getSetting('GOOGLE_APPLICATION_CREDENTIALS');

  if (!projectId) return Response.json({ ok: false, step: 'config', error: 'GCP_PROJECT_ID not set' });
  if (!credPath) return Response.json({ ok: false, step: 'config', error: 'GOOGLE_APPLICATION_CREDENTIALS not set' });

  let token: string;
  try {
    const auth = new GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const res = await client.getAccessToken();
    if (!res.token) throw new Error('No token returned');
    token = res.token;
  } catch (err: unknown) {
    return Response.json({
      ok: false,
      step: 'auth',
      error: err instanceof Error ? err.message : String(err),
      hint: 'Verify the credentials file is a valid GCP service account JSON key',
    });
  }

  try {
    const endpoint =
      `https://${region}-aiplatform.googleapis.com/v1/` +
      `projects/${projectId}/locations/${region}/` +
      `publishers/google/models/gemini-2.5-flash:generateContent`;

    await axios.post(
      endpoint,
      { contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK only.' }] }] },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20_000 }
    );
  } catch (err: unknown) {
    const e = err as { response?: { status: number; data?: { error?: { message?: string } } } };
    const status = e?.response?.status;
    const msg = e?.response?.data?.error?.message ?? (err instanceof Error ? err.message : String(err));
    return Response.json({
      ok: false,
      step: 'vertex',
      error: `${status ? `HTTP ${status}: ` : ''}${msg}`,
      hint: status === 403
        ? 'Service account may be missing the "Vertex AI User" role'
        : status === 404
        ? `Region ${region} may not have the model. Try us-central1`
        : undefined,
    });
  }

  return Response.json({ ok: true, backend: 'Vertex AI', projectId, region });
}
