import { writeFileSync } from 'fs';
import { join } from 'path';
import { getSetting, saveSettings, writableDir } from '@/lib/settings';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    if (!file.name.endsWith('.json')) {
      return Response.json({ error: 'File must be a .json file' }, { status: 400 });
    }

    const text = await file.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ error: 'File is not valid JSON' }, { status: 400 });
    }

    // Basic validation that this looks like a GCP service account key
    if (!parsed.type || !parsed.project_id || !parsed.private_key) {
      return Response.json({
        error: 'File does not look like a GCP service account JSON key (missing type, project_id, or private_key)',
      }, { status: 400 });
    }

    const credPath = getSetting('GOOGLE_APPLICATION_CREDENTIALS') || './gcp-credentials.json';
    const absPath = credPath.startsWith('.')
      ? join(writableDir(), credPath.replace(/^\.\//, ''))
      : credPath;

    writeFileSync(absPath, text, 'utf8');

    // Auto-fill project ID from the credentials if not already set
    const currentProjectId = getSetting('GCP_PROJECT_ID');
    if (!currentProjectId && parsed.project_id) {
      saveSettings({ GCP_PROJECT_ID: String(parsed.project_id) });
    }

    return Response.json({ ok: true, path: credPath, projectId: parsed.project_id });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
