import type { NextRequest } from 'next/server';
import { familyStateFor } from '@/lib/refine-filesystem';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const family = req.nextUrl.searchParams.get('family');
  if (!family) return Response.json({ error: 'family required' }, { status: 400 });

  return Response.json({
    family,
    lifestyle: familyStateFor('lifestyle', family),
    detail: familyStateFor('detail', family),
  });
}
