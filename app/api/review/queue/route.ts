import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { GapReport, GenerationResult, SLOT_NAMES } from '@/lib/types';
import { OUTPUT_DIR, GAP_REPORT_PATH } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const manifestPath = join(OUTPUT_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) return Response.json({ items: [] });

  const items: GenerationResult[] = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const gap: GapReport | null = existsSync(GAP_REPORT_PATH)
    ? JSON.parse(readFileSync(GAP_REPORT_PATH, 'utf8'))
    : null;

  const pending = items.filter((i) => !i.approved);

  return Response.json({
    items: pending.map((i) => {
      const row = gap?.rows.find((r) => r.sku === i.sku) ?? null;
      return {
        ...i,
        imageUrl: `/api/output/${basename(i.outputPath)}`,
        productTitle: row?.productTitle ?? null,
        productType: row?.productType ?? null,
        mainImageUrl: row?.mainImageUrl ?? null,
        slotName: SLOT_NAMES[i.slot],
      };
    }),
    approved: items.filter((i) => i.approved).length,
    total: items.length,
  });
}
