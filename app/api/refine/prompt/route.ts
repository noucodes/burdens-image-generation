import { buildRefinePrompt } from '@/lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLOTS = ['lifestyle', 'detail'] as const;
type SlotName = typeof SLOTS[number];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slot = searchParams.get('slot') as SlotName;
  const family = searchParams.get('family') ?? '';
  const note = searchParams.get('note') ?? undefined;
  const hasAnchor = searchParams.get('hasAnchor') === '1';

  if (!slot || !SLOTS.includes(slot)) {
    return Response.json({ error: 'slot must be lifestyle or detail' }, { status: 400 });
  }
  if (!family) {
    return Response.json({ error: 'family required' }, { status: 400 });
  }

  const prompt = buildRefinePrompt(slot, family, note || undefined, hasAnchor);
  return Response.json({ prompt });
}
