'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';

type GenerationType = 'lifestyle' | 'detail' | 'all';

interface Snapshot {
  running: boolean;
  log: string;
  generated: number;
  total: number;
  stoppedEarly: boolean;
}

interface CheckpointStats {
  done: number;
  blocked: number;
  errored: number;
  dailyUsage: { date: string; count: number };
}

const FREE_TIER_DAILY = 500;

export default function GeneratePage() {
  const [type, setType] = useState<GenerationType>('lifestyle');
  const [limit, setLimit] = useState(0);
  const [maxToday, setMaxToday] = useState(0);
  const [dryRun, setDryRun] = useState(false);

  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [stats, setStats] = useState<CheckpointStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const logRef = useRef<HTMLPreElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Load checkpoint stats
  const refreshStats = useCallback(() => {
    fetch('/api/generate')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && !d.error && setStats(d))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  // Connect to the log SSE stream. On reconnect, the server sends the full log first.
  const connectToLog = useCallback(async () => {
    if (readerRef.current) return; // already connected

    try {
      const res = await fetch('/api/generate/log');
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      readerRef.current = reader;
      setConnected(true);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const e of events) {
          const lines = e.split('\n');
          const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
          const data = lines.find((l) => l.startsWith('data:'))?.slice(5).trim();
          if (!event || !data) continue;
          let payload: unknown;
          try { payload = JSON.parse(data); } catch { continue; }

          if (event === 'snapshot') {
            const snap = payload as Snapshot;
            setLog(snap.log);
            setRunning(snap.running);
            setSnapshot(snap);
          } else if (event === 'log') {
            setLog((prev) => prev + (payload as string));
          } else if (event === 'done') {
            const p = payload as Snapshot;
            setRunning(false);
            setSnapshot((s) => s ? { ...s, ...p, running: false } : null);
            refreshStats();
          } else if (event === 'error') {
            setError((payload as { message: string }).message);
            setRunning(false);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      readerRef.current = null;
      setConnected(false);
    }
  }, [refreshStats]);

  // On mount: connect to log stream to pick up any running/previous session
  useEffect(() => {
    connectToLog();
    return () => {
      readerRef.current?.cancel();
      readerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    if (running) return;
    setLog('');
    setError(null);
    setSnapshot(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, limit, maxToday, dryRun }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }

      // POST returns the log stream directly — read it
      const reader = res.body!.getReader();
      readerRef.current = reader;
      setRunning(true);
      setConnected(true);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const e of events) {
          const lines = e.split('\n');
          const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
          const data = lines.find((l) => l.startsWith('data:'))?.slice(5).trim();
          if (!event || !data) continue;
          let payload: unknown;
          try { payload = JSON.parse(data); } catch { continue; }

          if (event === 'snapshot') {
            const snap = payload as Snapshot;
            setLog(snap.log);
            setSnapshot(snap);
          } else if (event === 'log') {
            setLog((prev) => prev + (payload as string));
          } else if (event === 'done') {
            const p = payload as Snapshot;
            setRunning(false);
            setSnapshot((s) => s ? { ...s, ...p, running: false } : null);
            refreshStats();
          } else if (event === 'error') {
            setError((payload as { message: string }).message);
            setRunning(false);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
        setRunning(false);
      }
    } finally {
      readerRef.current = null;
      setConnected(false);
    }
  }, [type, limit, maxToday, dryRun, running, refreshStats]);

  const stop = useCallback(async () => {
    // Signal the server to abort (generation will finish current item then stop)
    await fetch('/api/generate', { method: 'DELETE' }).catch(() => {});
    // Also cancel our SSE reader
    readerRef.current?.cancel();
    readerRef.current = null;
    setRunning(false);
    setConnected(false);
    setLog((prev) => prev + '\n[stop requested — finishing current item…]\n');
  }, []);

  const reconnect = useCallback(() => {
    setError(null);
    connectToLog();
  }, [connectToLog]);

  const usedToday = stats?.dailyUsage.count ?? 0;
  const remainingToday = Math.max(0, FREE_TIER_DAILY - usedToday);

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <PageHeader title="Generate" subtitle="Run AI image generation on SKUs identified in the audit" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-4">Session settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Image type</label>
                <div className="flex flex-col gap-1.5">
                  {(['lifestyle', 'detail', 'all'] as GenerationType[]).map((t) => (
                    <label key={t} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value={t}
                        checked={type === t}
                        onChange={() => setType(t)}
                        disabled={running}
                        className="accent-blue-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700 capitalize">{t}</span>
                        {t === 'lifestyle' && <span className="text-xs text-gray-400 ml-1">(slot 3)</span>}
                        {t === 'detail' && <span className="text-xs text-gray-400 ml-1">(slot 2)</span>}
                        {t === 'all' && <span className="text-xs text-gray-400 ml-1">(slots 2+3)</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Limit <span className="text-gray-400 font-normal">(0 = no limit)</span>
                </label>
                <input
                  type="number"
                  value={limit}
                  min={0}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
                  disabled={running}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Max today <span className="text-gray-400 font-normal">(0 = use remaining)</span>
                </label>
                <input
                  type="number"
                  value={maxToday}
                  min={0}
                  onChange={(e) => setMaxToday(parseInt(e.target.value) || 0)}
                  disabled={running}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  disabled={running}
                  className="accent-blue-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Dry run</span>
                  <p className="text-xs text-gray-400">Preview worklist without generating</p>
                </div>
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              {running ? (
                <button
                  onClick={stop}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={start}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {dryRun ? 'Preview' : 'Start generation'}
                </button>
              )}
            </div>
          </div>

          {/* Quota tracker */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">Free tier quota</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Used today</span>
                <span className="font-medium">{usedToday} / {FREE_TIER_DAILY}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${usedToday > 400 ? 'bg-red-500' : usedToday > 300 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${(usedToday / FREE_TIER_DAILY) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{remainingToday} remaining</span>
                <span>Resets midnight UTC</span>
              </div>
            </div>

            {stats && (
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Done', value: stats.done, color: 'text-green-600' },
                  { label: 'Blocked', value: stats.blocked, color: 'text-orange-600' },
                  { label: 'Errors', value: stats.errored, color: 'text-red-600' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session result */}
          {snapshot && !snapshot.running && (
            <div className={`rounded-xl border p-4 shadow-sm ${snapshot.stoppedEarly ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`font-semibold text-sm ${snapshot.stoppedEarly ? 'text-amber-800' : 'text-green-800'}`}>
                {snapshot.stoppedEarly ? 'Session stopped early' : 'Session complete'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Generated {snapshot.generated} of {snapshot.total} image(s)
              </p>
              {snapshot.stoppedEarly && (
                <p className="text-xs text-amber-700 mt-1">Re-run to continue.</p>
              )}
            </div>
          )}
        </div>

        {/* Log output */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-800 text-sm">Log</h3>
              <div className="flex items-center gap-3">
                {running ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Running
                  </span>
                ) : connected ? (
                  <span className="text-xs text-gray-400">Connected</span>
                ) : log ? (
                  <button onClick={reconnect} className="text-xs text-blue-500 hover:underline">
                    Reconnect
                  </button>
                ) : null}
                {log && !running && (
                  <button
                    onClick={() => setLog('')}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 shrink-0">
                <strong>Error:</strong> {error}
              </div>
            )}

            <pre
              ref={logRef}
              className="log-pane p-4 text-xs font-mono text-slate-300 bg-slate-950 flex-1 overflow-y-auto whitespace-pre-wrap min-h-[520px]"
            >
              {log || (
                <span className="text-slate-600">
                  {running ? 'Connecting…' : 'Output will appear here when generation starts…'}
                </span>
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
