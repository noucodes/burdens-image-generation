import { readFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { CANDIDATES_DIR } from '@/lib/paths';

export const runtime = 'nodejs';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const abs = resolve(join(CANDIDATES_DIR, ...path));
  if (!abs.startsWith(CANDIDATES_DIR + sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const data = await readFile(abs);
    const ext = abs.split('.').pop()?.toLowerCase() ?? 'jpg';
    return new Response(data, {
      headers: {
        'Content-Type': MIME[ext] ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
