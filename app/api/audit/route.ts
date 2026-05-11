import { writeFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { GapReport, ImageSlot, SkuAuditRow } from '@/lib/types';
import { GAP_REPORT_PATH } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALL_SLOTS: ImageSlot[] = [1, 2, 3, 4];

interface SourceRow {
  sku: string;
  title: string;
  vendorCatalog: string;
  productFamily: string;
  imageUrls: Partial<Record<ImageSlot, string>>;
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalised = headers.map(normHeader);
  for (const alias of aliases) {
    const idx = normalised.indexOf(normHeader(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseXlsx(buffer: Buffer): SourceRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) throw new Error('Spreadsheet has no data rows');

  const headers = (rows[0] as string[]).map((h) => String(h || '').trim());
  const cols = {
    sku: findColumn(headers, ['Burdens SKU', 'SKU', 'sku']),
    title: findColumn(headers, ['Title - Plumbers HQ', 'Title', 'Product Title']),
    vendorCatalog: findColumn(headers, ['Vendor Catalog No.', 'Vendor Catalog', 'Catalog']),
    family: findColumn(headers, ['Product Family - Plumbers HQ', 'Product Family', 'Family', 'Category']),
    main: findColumn(headers, ['Main Image', 'Main', 'Image1', 'image1']),
    image2: findColumn(headers, ['Image2', 'image2', 'Detail Image']),
    image3: findColumn(headers, ['image3', 'Image3', 'Lifestyle Image', 'Context Image']),
    image4: findColumn(headers, ['image4', 'Image4', 'Scale Image', 'Dimension Image']),
  };

  if (cols.sku === -1) throw new Error(`Could not find SKU column. Headers: ${headers.join(', ')}`);
  if (cols.main === -1) throw new Error(`Could not find Main Image column. Headers: ${headers.join(', ')}`);

  const result: SourceRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const sku = String(row[cols.sku] ?? '').trim();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);

    const cell = (idx: number) => idx === -1 ? '' : String(row[idx] ?? '').trim();
    const imageUrls: Partial<Record<ImageSlot, string>> = {};
    const m = cell(cols.main);
    const i2 = cell(cols.image2);
    const i3 = cell(cols.image3);
    const i4 = cell(cols.image4);
    if (m) imageUrls[1] = m;
    if (i2) imageUrls[2] = i2;
    if (i3) imageUrls[3] = i3;
    if (i4) imageUrls[4] = i4;

    result.push({ sku, title: cell(cols.title), vendorCatalog: cell(cols.vendorCatalog), productFamily: cell(cols.family), imageUrls });
  }

  return result;
}

function classifyRow(src: SourceRow): SkuAuditRow {
  const existingSlots = ALL_SLOTS.filter((s) => !!src.imageUrls[s]);
  const missingSlots = ALL_SLOTS.filter((s) => !src.imageUrls[s]);
  const mainImageUrl = src.imageUrls[1] ?? null;
  let status: SkuAuditRow['status'];
  if (missingSlots.length === 0) status = 'complete';
  else if (!mainImageUrl) status = 'no_main_image';
  else status = 'needs_generation';
  return { sku: src.sku, productId: null, productTitle: src.title || null, productType: src.productFamily || null, vendor: null, existingSlots, missingSlots, mainImageUrl, status };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file uploaded' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const sourceRows = parseXlsx(buffer);
    const rows = sourceRows.map(classifyRow);

    const report: GapReport = {
      generatedAt: new Date().toISOString(),
      totalSkus: rows.length,
      complete: rows.filter((r) => r.status === 'complete').length,
      needsGeneration: rows.filter((r) => r.status === 'needs_generation').length,
      missingMain: rows.filter((r) => r.status === 'no_main_image').length,
      notFound: 0,
      rows,
    };

    writeFileSync(GAP_REPORT_PATH, JSON.stringify(report, null, 2));
    return Response.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { existsSync, readFileSync } = await import('fs');
    if (!existsSync(GAP_REPORT_PATH)) {
      return Response.json({ error: 'No gap report found. Upload a spreadsheet first.' }, { status: 404 });
    }
    const report: GapReport = JSON.parse(readFileSync(GAP_REPORT_PATH, 'utf8'));
    return Response.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
