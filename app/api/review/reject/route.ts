import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { GenerationResult } from '@/lib/types';
import { OUTPUT_DIR } from '@/lib/paths';

export const runtime = 'nodejs';

const REJECTED_DIR = join(OUTPUT_DIR, 'rejected');

export async function POST(req: Request) {
  const { sku, slot } = await req.json() as { sku: string; slot: number };

  const manifestPath = join(OUTPUT_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) return Response.json({ error: 'No manifest' }, { status: 404 });

  const items: GenerationResult[] = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const idx = items.findIndex((i) => i.sku === sku && i.slot === slot);
  if (idx === -1) return Response.json({ error: 'Item not found' }, { status: 404 });

  const item = items[idx];
  if (!existsSync(REJECTED_DIR)) mkdirSync(REJECTED_DIR, { recursive: true });

  const target = join(REJECTED_DIR, basename(item.outputPath));
  if (existsSync(item.outputPath)) renameSync(item.outputPath, target);
  items.splice(idx, 1);

  writeFileSync(manifestPath, JSON.stringify(items, null, 2));
  return Response.json({ ok: true });
}
