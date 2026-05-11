import { createLogStream } from '@/lib/generation-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reconnectable SSE endpoint. Sends current log snapshot then streams live events if still running. */
export async function GET() {
  return createLogStream();
}
