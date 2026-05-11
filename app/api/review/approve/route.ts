import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { GenerationResult } from '@/lib/types';
import { OUTPUT_DIR } from '@/lib/paths';

export const runtime = 'nodejs';

const APPROVED_DIR = join(OUTPUT_DIR, 'approved');

export async function POST(req: Request) {
  const { sku, slot } = await req.json() as { sku: string; slot: number };

  const manifestPath = join(OUTPUT_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) return Response.json({ error: 'No manifest' }, { status: 404 });

  const items: GenerationResult[] = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const item = items.find((i) => i.sku === sku && i.slot === slot);
  if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });

  if (!existsSync(APPROVED_DIR)) mkdirSync(APPROVED_DIR, { recursive: true });

  const target = join(APPROVED_DIR, basename(item.outputPath));
  if (existsSync(item.outputPath)) renameSync(item.outputPath, target);
  item.outputPath = target;
  item.approved = true;

  writeFileSync(manifestPath, JSON.stringify(items, null, 2));
  return Response.json({ ok: true });
}
