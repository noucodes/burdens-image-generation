import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import { getSetting } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const projectId = getSetting('GCP_PROJECT_ID');
  const region = getSetting('GCP_REGION') || 'us-central1';
  const credPath = getSetting('GOOGLE_APPLICATION_CREDENTIALS');

  if (!projectId) return Response.json({ ok: false, step: 'config', error: 'GCP_PROJECT_ID not set' });
  if (!credPath) return Response.json({ ok: false, step: 'config', error: 'GOOGLE_APPLICATION_CREDENTIALS not set' });

  // Step 1: auth token
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

  // Step 2: light Vertex AI call (text-only, no image generation to save quota)
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

  return Response.json({ ok: true, projectId, region });
}
