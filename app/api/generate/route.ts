import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { GeminiImageClient, RateLimitError, AccessError, GenerationBlockedError } from '@/lib/gemini';
import { Checkpoint } from '@/lib/checkpoint';
import { resolveReference, loadReferenceBase64 } from '@/lib/references';
import { getPromptForSlot } from '@/lib/prompts';
import { GapReport, GenerationResult, ImageSlot, SLOT_NAMES, SkuAuditRow } from '@/lib/types';
import { OUTPUT_DIR, GAP_REPORT_PATH } from '@/lib/paths';
import { state, startRun, appendLog, finishRun, failRun, requestAbort, createLogStream } from '@/lib/generation-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_GENERATABLE_SLOTS: ImageSlot[] = [2, 3];
const REQUEST_INTERVAL_MS = 2_000;   // ~30 RPM — suitable for paid/credit accounts; reduce if still rate-limited
const PER_MINUTE_BACKOFF_MS = 70_000;
const MAX_RETRIES_PER_ITEM = 2;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function slotsForType(type: string): ImageSlot[] {
  if (type === 'lifestyle') return [3];
  if (type === 'detail') return [2];
  return AI_GENERATABLE_SLOTS;
}

async function generateOne(
  client: GeminiImageClient,
  row: SkuAuditRow,
  slot: ImageSlot,
): Promise<GenerationResult> {
  const ref = resolveReference(slot, row.productType);
  const prompt = getPromptForSlot(slot, {
    productTitle: row.productTitle!,
    productType: row.productType ?? '',
    vendor: row.vendor ?? '',
  }, !!ref);
  const styleReference = ref ? { base64: loadReferenceBase64(ref), mimeType: ref.mimeType } : undefined;
  const result = await client.generate({ prompt, referenceImageUrl: row.mainImageUrl!, styleReference });

  const outputPath = join(OUTPUT_DIR, `${row.sku}_${slot}.jpg`);
  await sharp(result.imageBytes).resize(2000, 2000, { fit: 'cover' }).jpeg({ quality: 90 }).toFile(outputPath);
  writeFileSync(outputPath.replace(/\.jpg$/, '.prompt.txt'), prompt);

  return { sku: row.sku, slot, outputPath, prompt, modelVersion: result.modelVersion, generatedAt: new Date().toISOString(), approved: false };
}

async function runGenerationBackground(options: { type: string; limit: number; maxToday: number; dryRun: boolean }) {
  const { type, limit, maxToday, dryRun } = options;

  try {
    if (!existsSync(GAP_REPORT_PATH)) {
      failRun('No gap report found. Run audit first.');
      return;
    }

    const report: GapReport = JSON.parse(readFileSync(GAP_REPORT_PATH, 'utf8'));
    const slots = slotsForType(type);
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

    const checkpoint = new Checkpoint(join(OUTPUT_DIR, '.checkpoint.json'));
    const client = new GeminiImageClient();

    const worklist: Array<{ row: SkuAuditRow; slot: ImageSlot }> = [];
    for (const row of report.rows) {
      if (row.status !== 'needs_generation') continue;
      for (const slot of slots) {
        if (!row.missingSlots.includes(slot)) continue;
        if (!checkpoint.shouldAttempt(row.sku, slot)) continue;
        worklist.push({ row, slot });
      }
    }

    let limited = worklist;
    if (limit > 0) limited = limited.slice(0, limit);
    const remainingToday = checkpoint.remainingFreeTierToday();
    const sessionCap = maxToday > 0 ? Math.min(maxToday, remainingToday) : remainingToday;
    if (limited.length > sessionCap) limited = limited.slice(0, sessionCap);

    startRun(limited.length);

    appendLog(`Session: ${dryRun ? 'DRY RUN — ' : ''}${limited.length} item(s) to process\n`);
    appendLog(`Free-tier today: ${checkpoint.dailyUsageCount()} used, ${remainingToday} remaining\n`);
    appendLog(`Slots: ${slots.map((s) => SLOT_NAMES[s]).join(', ')}\n\n`);

    if (limited.length === 0) {
      const msg = worklist.length === 0
        ? 'Nothing to do — all eligible items already complete.\n'
        : 'Daily free-tier quota reached. Re-run after midnight UTC.\n';
      appendLog(msg);
      finishRun(0, worklist.length > 0);
      return;
    }

    const results: GenerationResult[] = [];
    let stoppedEarly = false;

    for (let i = 0; i < limited.length; i++) {
      if (state.abortRequested) {
        appendLog('\n[stopped by user]\n');
        stoppedEarly = true;
        break;
      }

      const { row, slot } = limited[i];
      const tag = `[${i + 1}/${limited.length}] ${row.sku} slot ${slot} (${SLOT_NAMES[slot]})`;

      if (!row.mainImageUrl || !row.productTitle) {
        appendLog(`${tag} — skip: insufficient context\n`);
        continue;
      }

      if (dryRun) {
        appendLog(`${tag} — would generate\n`);
        continue;
      }

      let attempt = 0;
      let succeeded = false;

      while (attempt <= MAX_RETRIES_PER_ITEM && !succeeded && !state.abortRequested) {
        attempt++;
        appendLog(`${tag}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}... `);

        try {
          const r = await generateOne(client, row, slot);
          results.push(r);
          checkpoint.markDone(row.sku, slot);
          checkpoint.incrementDailyUsage();
          appendLog(`done\n`);
          succeeded = true;
        } catch (err) {
          if (err instanceof RateLimitError) {
            if (err.scope === 'per_day') { appendLog('DAILY QUOTA HIT\n'); stoppedEarly = true; break; }
            const waitMs = (err.retryAfterSeconds ?? 0) * 1000 || PER_MINUTE_BACKOFF_MS;
            appendLog(`rate-limited, waiting ${Math.round(waitMs / 1000)}s\n`);
            await sleep(waitMs);
            attempt--;
            continue;
          }
          if (err instanceof AccessError) {
            appendLog(`ACCESS ERROR: ${err.message}\n`);
            if (err.hint) appendLog(`hint: ${err.hint}\n`);
            stoppedEarly = true;
            break;
          }
          if (err instanceof GenerationBlockedError) {
            appendLog(`BLOCKED (${err.reason})\n`);
            checkpoint.markBlocked(row.sku, slot, err.message);
            break;
          }
          appendLog(`ERROR: ${(err as Error).message}\n`);
          if (attempt > MAX_RETRIES_PER_ITEM) checkpoint.markError(row.sku, slot, (err as Error).message);
        }
      }

      if (stoppedEarly) break;
      if (i < limited.length - 1 && !state.abortRequested) await sleep(REQUEST_INTERVAL_MS);
    }

    // Update manifest
    const manifestPath = join(OUTPUT_DIR, 'manifest.json');
    let existing: GenerationResult[] = [];
    if (existsSync(manifestPath)) existing = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(manifestPath, JSON.stringify([...existing, ...results], null, 2));

    const summary = checkpoint.summary();
    appendLog(`\n─── done ───\n`);
    appendLog(`Generated this run: ${results.length}\n`);
    appendLog(`All-time done: ${summary.done}\n`);
    if (stoppedEarly) appendLog('Stopped early — re-run to continue.\n');

    finishRun(results.length, stoppedEarly);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`\nFATAL ERROR: ${message}\n`);
    failRun(message);
  }
}

export async function POST(req: Request) {
  if (state.running) {
    return Response.json({ error: 'Generation already in progress' }, { status: 409 });
  }

  const body = await req.json() as { type?: string; limit?: number; maxToday?: number; dryRun?: boolean };
  const options = {
    type: body.type ?? 'lifestyle',
    limit: body.limit ?? 0,
    maxToday: body.maxToday ?? 0,
    dryRun: body.dryRun ?? false,
  };

  // Fire-and-forget: generation runs independently of this HTTP response
  runGenerationBackground(options).catch(() => {});

  // Return the live log stream immediately
  return createLogStream();
}

export async function DELETE() {
  requestAbort();
  return Response.json({ ok: true });
}

export async function GET() {
  try {
    const { Checkpoint } = await import('@/lib/checkpoint');
    const checkpointPath = join(OUTPUT_DIR, '.checkpoint.json');
    if (!existsSync(checkpointPath)) {
      return Response.json({ done: 0, blocked: 0, errored: 0, dailyUsage: { date: '', count: 0 } });
    }
    const checkpoint = new Checkpoint(checkpointPath);
    return Response.json(checkpoint.summary());
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
