import { discoverFamilies } from '@/lib/refine-filesystem';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(discoverFamilies());
}
