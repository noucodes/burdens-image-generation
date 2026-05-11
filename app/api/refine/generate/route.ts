import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { GeminiImageClient, RateLimitError, AccessError, GenerationBlockedError } from '@/lib/gemini';
import { buildRefinePrompt } from '@/lib/prompts';
import { familyToSlug, nextRoundNumber } from '@/lib/refine-filesystem';
import { CANDIDATES_DIR } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLOTS = ['lifestyle', 'detail'] as const;
type SlotName = typeof SLOTS[number];

export async function POST(req: Request) {
  const body = await req.json() as {
    family: string;
    slot: SlotName;
    count?: number;
    anchor?: string;
    note?: string;
    customPrompt?: string;
  };
  const { family, slot, anchor, note, customPrompt } = body;

  if (!family || !slot) return Response.json({ error: 'family + slot required' }, { status: 400 });
  if (!SLOTS.includes(slot)) return Response.json({ error: 'slot must be lifestyle or detail' }, { status: 400 });

  const count = Math.min(Math.max(parseInt(String(body.count ?? 4), 10) || 4, 1), 8);
  const slug = familyToSlug(family);
  const roundNum = nextRoundNumber(slot, slug);
  const roundDir = join(CANDIDATES_DIR, slot, slug, `round-${roundNum}`);
  mkdirSync(roundDir, { recursive: true });

  const encoder = new TextEncoder();
  let aborted = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* disconnected */ }
      };
      const log = (msg: string) => send('log', msg);

      try {
        const prompt = customPrompt?.trim() || buildRefinePrompt(slot, family, note, !!anchor);

        writeFileSync(join(roundDir, '_prompt.txt'), prompt);
        writeFileSync(join(roundDir, '_args.json'), JSON.stringify({ family, slot, count, anchor, note }, null, 2));

        log(`Generating ${count} candidate(s) for ${family} / ${slot} (round ${roundNum})\n`);
        if (note) log(`Note: "${note}"\n`);
        if (anchor) log(`Anchor: ${anchor}\n`);
        log('\n');

        const client = new GeminiImageClient();

        // Load anchor as base64 if provided
        let anchorStyleRef: { base64: string; mimeType: string } | undefined;
        if (anchor) {
          try {
            if (anchor.startsWith('http')) {
              const { default: axios } = await import('axios');
              const res = await axios.get<ArrayBuffer>(anchor, { responseType: 'arraybuffer', timeout: 30_000 });
              anchorStyleRef = {
                base64: Buffer.from(res.data).toString('base64'),
                mimeType: res.headers['content-type']?.toString() || 'image/jpeg',
              };
            } else if (existsSync(anchor)) {
              const buf = readFileSync(anchor);
              const ext = anchor.split('.').pop()?.toLowerCase() ?? 'jpg';
              const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
              anchorStyleRef = { base64: buf.toString('base64'), mimeType: mimeMap[ext] ?? 'image/jpeg' };
            }
          } catch (err) {
            log(`Warning: could not load anchor image: ${(err as Error).message}\n`);
          }
        }

        const INTERVAL_MS = 7_500;
        const BASE_BACKOFF_MS = 65_000;
        const MAX_RL_RETRIES = 4;

        let generated = 0;

        for (let i = 1; i <= count; i++) {
          if (aborted) break;
          log(`Generating candidate ${i}/${count}... `);

          let rlRetries = 0;
          let done = false;
          while (!done && !aborted) {
            try {
              const result = await client.generate({
                prompt,
                referenceImageUrl: anchorStyleRef
                  ? `data:${anchorStyleRef.mimeType};base64,${anchorStyleRef.base64}`
                  : undefined,
              });

              const filename = `candidate-${i}.jpg`;
              const outputPath = join(roundDir, filename);

              await sharp(result.imageBytes)
                .resize(1024, 1024, { fit: 'cover' })
                .jpeg({ quality: 90 })
                .toFile(outputPath);

              log(`done → ${filename}\n`);
              generated++;
              done = true;
            } catch (err) {
              if (err instanceof RateLimitError) {
                if (err.scope === 'per_day') { log(`daily quota hit\n`); aborted = true; break; }
                if (rlRetries >= MAX_RL_RETRIES) { log(`rate-limited too many times, skipping\n`); done = true; break; }
                const backoff = (err.retryAfterSeconds ?? 0) * 1000 || BASE_BACKOFF_MS * Math.pow(2, rlRetries);
                rlRetries++;
                log(`rate-limited (${rlRetries}/${MAX_RL_RETRIES}), waiting ${Math.round(backoff / 1000)}s\n`);
                await new Promise<void>((r) => setTimeout(r, backoff));
              } else if (err instanceof AccessError) {
                log(`ACCESS ERROR: ${err.message}\n`);
                if (err.hint) log(`hint: ${err.hint}\n`);
                aborted = true;
                break;
              } else if (err instanceof GenerationBlockedError) {
                log(`blocked: ${err.reason}\n`);
                done = true;
              } else {
                log(`error: ${(err as Error).message}\n`);
                done = true;
              }
            }
          }

          if (aborted) break;
          if (i < count) {
            await new Promise<void>((r) => setTimeout(r, INTERVAL_MS));
          }
        }

        log(`\nDone — ${generated}/${count} generated in round-${roundNum}\n`);
        send('done', { code: 0, generated, roundNumber: roundNum });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        send('error', { message });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      aborted = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
