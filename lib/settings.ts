import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

/** /tmp on serverless (Vercel/Lambda), process.cwd() for local dev */
export function writableDir(): string {
  if (
    process.env.VERCEL === '1' ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.cwd().startsWith('/var/')
  ) {
    return '/tmp';
  }
  return process.cwd();
}

const SETTINGS_PATH = join(writableDir(), 'settings.json');

export interface AppSettings {
  /** Google AI Studio API key — free tier, simpler auth. Takes priority over Vertex AI when set. */
  GEMINI_API_KEY?: string;
  GCP_PROJECT_ID?: string;
  GCP_REGION?: string;
  /** Path to the GCP service account JSON key file, relative to project root */
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  /** Custom prompt templates. Use {{productTitle}}, {{productType}}, {{vendor}} as placeholders. */
  PROMPT_DETAIL?: string;
  PROMPT_DETAIL_STYLE_REF?: string;
  PROMPT_LIFESTYLE?: string;
  PROMPT_LIFESTYLE_STYLE_REF?: string;
}

let _cache: AppSettings | null = null;
let _cacheMtime = 0;

export function loadSettings(): AppSettings {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    const mtime = statSync(SETTINGS_PATH).mtimeMs;
    if (_cache && mtime <= _cacheMtime) return _cache;
    _cache = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    _cacheMtime = mtime;
    return _cache!;
  } catch {
    return {};
  }
}

export function saveSettings(patch: AppSettings): void {
  const current = loadSettings();
  const next = { ...current, ...patch };
  writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  _cache = next;
  _cacheMtime = Date.now();
}

/**
 * Resolve a setting value: process.env takes precedence over settings.json.
 * This lets .env.local override for local dev while settings.json works in prod.
 */
export function getSetting(key: keyof AppSettings): string | undefined {
  return process.env[key] || loadSettings()[key];
}
