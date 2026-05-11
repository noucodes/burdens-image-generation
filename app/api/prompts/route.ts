import { loadSettings, saveSettings, AppSettings } from '@/lib/settings';
import { buildDetailPrompt, buildLifestylePrompt } from '@/lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLACEHOLDER_CTX = {
  productTitle: '{{productTitle}}',
  productType: '{{productType}}',
  vendor: '{{vendor}}',
};

export async function GET() {
  const settings = loadSettings();
  return Response.json({
    PROMPT_DETAIL: settings.PROMPT_DETAIL ?? null,
    PROMPT_DETAIL_STYLE_REF: settings.PROMPT_DETAIL_STYLE_REF ?? null,
    PROMPT_LIFESTYLE: settings.PROMPT_LIFESTYLE ?? null,
    PROMPT_LIFESTYLE_STYLE_REF: settings.PROMPT_LIFESTYLE_STYLE_REF ?? null,
    defaults: {
      PROMPT_DETAIL: buildDetailPrompt(PLACEHOLDER_CTX, false),
      PROMPT_DETAIL_STYLE_REF: buildDetailPrompt(PLACEHOLDER_CTX, true),
      PROMPT_LIFESTYLE: buildLifestylePrompt(PLACEHOLDER_CTX, false),
      PROMPT_LIFESTYLE_STYLE_REF: buildLifestylePrompt(PLACEHOLDER_CTX, true),
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json() as Partial<Pick<AppSettings,
    'PROMPT_DETAIL' | 'PROMPT_DETAIL_STYLE_REF' | 'PROMPT_LIFESTYLE' | 'PROMPT_LIFESTYLE_STYLE_REF'
  >>;
  const patch: AppSettings = {};
  for (const key of ['PROMPT_DETAIL', 'PROMPT_DETAIL_STYLE_REF', 'PROMPT_LIFESTYLE', 'PROMPT_LIFESTYLE_STYLE_REF'] as const) {
    if (key in body) patch[key] = body[key] || undefined;
  }
  saveSettings(patch);
  return Response.json({ ok: true });
}
