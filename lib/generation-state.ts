import { EventEmitter } from 'events';

/**
 * Module-level singleton. Persists for the lifetime of the Node.js process,
 * so generation keeps running even when SSE clients disconnect and reconnect.
 */

export const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export interface GenerationState {
  running: boolean;
  log: string;
  startedAt: string | null;
  generated: number;
  total: number;
  stoppedEarly: boolean;
  abortRequested: boolean;
}

export const state: GenerationState = {
  running: false,
  log: '',
  startedAt: null,
  generated: 0,
  total: 0,
  stoppedEarly: false,
  abortRequested: false,
};

export function startRun(total: number) {
  state.running = true;
  state.log = '';
  state.startedAt = new Date().toISOString();
  state.generated = 0;
  state.total = total;
  state.stoppedEarly = false;
  state.abortRequested = false;
}

export function appendLog(msg: string) {
  state.log += msg;
  emitter.emit('log', msg);
}

export function finishRun(generated: number, stoppedEarly: boolean) {
  state.running = false;
  state.generated = generated;
  state.stoppedEarly = stoppedEarly;
  emitter.emit('done', { generated, total: state.total, stoppedEarly });
}

export function failRun(message: string) {
  state.running = false;
  emitter.emit('error', { message });
}

export function requestAbort() {
  state.abortRequested = true;
}

/** Create a reconnectable SSE Response that sends current log then live events. */
export function createLogStream(): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch { /* client gone */ }
      };

      // Always send current snapshot first so reconnects see the full log
      enqueue('snapshot', {
        running: state.running,
        log: state.log,
        generated: state.generated,
        total: state.total,
        stoppedEarly: state.stoppedEarly,
      });

      if (!state.running) {
        controller.close();
        return;
      }

      const onLog = (msg: string) => enqueue('log', msg);
      const onDone = (data: unknown) => { enqueue('done', data); doCleanup(); controller.close(); };
      const onError = (data: unknown) => { enqueue('error', data); doCleanup(); controller.close(); };

      const doCleanup = () => {
        emitter.off('log', onLog);
        emitter.off('done', onDone);
        emitter.off('error', onError);
        cleanup = null;
      };

      cleanup = doCleanup;
      emitter.on('log', onLog);
      emitter.on('done', onDone);
      emitter.on('error', onError);
    },
    cancel() {
      // Client disconnected — clean up listeners but let generation keep running
      if (cleanup) { cleanup(); cleanup = null; }
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
