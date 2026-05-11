import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { CANDIDATES_DIR, REFERENCES_DIR } from '@/lib/paths';

export const runtime = 'nodejs';

const SLOTS = ['lifestyle', 'detail'];

export async function POST(req: Request) {
  const { candidatePath, slot, slug } = await req.json() as {
    candidatePath: string;
    slot: string;
    slug: string;
  };

  const abs = resolve(candidatePath);
  if (!abs.startsWith(CANDIDATES_DIR + sep)) {
    return Response.json({ error: 'candidatePath outside candidates dir' }, { status: 400 });
  }
  if (!existsSync(abs)) {
    return Response.json({ error: 'candidate file not found' }, { status: 404 });
  }
  if (!SLOTS.includes(slot)) {
    return Response.json({ error: 'invalid slot' }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return Response.json({ error: 'invalid slug' }, { status: 400 });
  }

  const slotDir = join(REFERENCES_DIR, slot);
  mkdirSync(slotDir, { recursive: true });

  const ext = extname(abs).toLowerCase();
  const target = join(slotDir, slug + ext);

  for (const e of ['.jpg', '.jpeg', '.png', '.webp']) {
    const other = join(slotDir, slug + e);
    if (other !== target && existsSync(other)) {
      const archiveDir = join(slotDir, '_archive');
      mkdirSync(archiveDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      copyFileSync(other, join(archiveDir, `${slug}-${ts}${e}`));
      unlinkSync(other);
    }
  }

  copyFileSync(abs, target);
  return Response.json({ ok: true, target });
}
