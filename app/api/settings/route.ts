import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { loadSettings, saveSettings, getSetting } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = loadSettings();

  const credPath = getSetting('GOOGLE_APPLICATION_CREDENTIALS');
  let credentialsStatus: 'missing' | 'found' | 'invalid' = 'missing';
  if (credPath) {
    const abs = resolve(credPath);
    if (existsSync(abs)) {
      try {
        const size = statSync(abs).size;
        credentialsStatus = size > 10 ? 'found' : 'invalid';
      } catch {
        credentialsStatus = 'invalid';
      }
    }
  }

  return Response.json({
    GEMINI_API_KEY: getSetting('GEMINI_API_KEY') ?? '',
    GCP_PROJECT_ID: getSetting('GCP_PROJECT_ID') ?? '',
    GCP_REGION: getSetting('GCP_REGION') ?? 'us-central1',
    GOOGLE_APPLICATION_CREDENTIALS: getSetting('GOOGLE_APPLICATION_CREDENTIALS') ?? './gcp-credentials.json',
    credentialsStatus,
    sources: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'env' : settings.GEMINI_API_KEY ? 'settings' : 'none',
      GCP_PROJECT_ID: process.env.GCP_PROJECT_ID ? 'env' : settings.GCP_PROJECT_ID ? 'settings' : 'none',
      GCP_REGION: process.env.GCP_REGION ? 'env' : settings.GCP_REGION ? 'settings' : 'none',
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'env' : settings.GOOGLE_APPLICATION_CREDENTIALS ? 'settings' : 'none',
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    GEMINI_API_KEY?: string;
    GCP_PROJECT_ID?: string;
    GCP_REGION?: string;
    GOOGLE_APPLICATION_CREDENTIALS?: string;
  };

  const patch: Record<string, string> = {};
  if (body.GEMINI_API_KEY !== undefined) patch.GEMINI_API_KEY = body.GEMINI_API_KEY.trim();
  if (body.GCP_PROJECT_ID !== undefined) patch.GCP_PROJECT_ID = body.GCP_PROJECT_ID.trim();
  if (body.GCP_REGION !== undefined) patch.GCP_REGION = body.GCP_REGION.trim();
  if (body.GOOGLE_APPLICATION_CREDENTIALS !== undefined) {
    patch.GOOGLE_APPLICATION_CREDENTIALS = body.GOOGLE_APPLICATION_CREDENTIALS.trim();
  }

  saveSettings(patch);
  return Response.json({ ok: true });
}
