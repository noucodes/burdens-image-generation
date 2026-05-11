'use client';

import { useEffect, useRef, useState } from 'react';
import type { FamilyState, RoundInfo, CandidateInfo } from '@/lib/refine-filesystem';

interface Props {
  slot: 'lifestyle' | 'detail';
  familyState: FamilyState;
  family: string;
  onRefresh: () => void;
  onZoom: (src: string) => void;
}

export default function SlotSection({ slot, familyState, family, onRefresh, onZoom }: Props) {
  const [count, setCount] = useState(4);
  const [anchor, setAnchor] = useState('');
  const [note, setNote] = useState('');
  const [generating, setGenerating] = useState(false);
  const [log, setLog] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
  const lockedExt = familyState.lockedReferenceExt;
  const lockedSrc = lockedExt
    ? `/api/refine/references/${slot}/${familyState.slug}.${lockedExt}`
    : null;

  async function loadPromptPreview() {
    setPromptLoading(true);
    const params = new URLSearchParams({ slot, family });
    if (note.trim()) params.set('note', note.trim());
    if (anchor.trim()) params.set('hasAnchor', '1');
    try {
      const res = await fetch(`/api/refine/prompt?${params}`);
      const data = await res.json() as { prompt?: string; error?: string };
      if (data.prompt) setPromptText(data.prompt);
    } catch { /* ignore */ } finally {
      setPromptLoading(false);
    }
  }

  function handleTogglePrompt() {
    if (!showPrompt && !promptText) loadPromptPreview();
    setShowPrompt((v) => !v);
  }

  async function handleGenerate() {
    setGenerating(true);
    setLog('');
    try {
      const res = await fetch('/api/refine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family,
          slot,
          count,
          anchor: anchor.trim() || undefined,
          note: note.trim() || undefined,
          customPrompt: showPrompt && promptText.trim() ? promptText.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ': ' + text : ''}`);
      }

      const reader = res.body!.getReader();
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
          if (event === 'log') {
            setLog((prev) => prev + (payload as string));
          } else if (event === 'done') {
            setLog((prev) => prev + `\n[done]\n`);
            onRefresh();
          } else if (event === 'error') {
            setLog((prev) => prev + `\n[error: ${(payload as { message: string }).message}]\n`);
          }
        }
      }
    } catch (err) {
      setLog((prev) => prev + `\n[connection error: ${(err as Error).message}]\n`);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePromote(candidatePath: string) {
    if (!confirm('Promote this candidate as the locked style reference for this family?')) return;
    const res = await fetch('/api/refine/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidatePath, slot, slug: familyState.slug }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (data.ok) {
      onRefresh();
    } else {
      alert('Promote failed: ' + (data.error ?? 'unknown'));
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{slotLabel}</span>
          <span className="text-sm font-semibold text-gray-800">{family}</span>
        </div>
        {lockedSrc && (
          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 font-medium">
            Reference locked
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Locked reference */}
        {lockedSrc ? (
          <div className="flex items-center gap-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lockedSrc}
              alt="Locked reference"
              className="w-14 h-14 object-cover rounded-md cursor-zoom-in flex-shrink-0"
              onClick={() => onZoom(lockedSrc)}
            />
            <div className="text-sm min-w-0">
              <p className="font-medium text-green-800">Locked reference</p>
              <p className="text-green-600 font-mono text-xs mt-0.5 truncate">
                references/{slot}/{familyState.slug}.{lockedExt}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            No locked reference yet — generate candidates and promote one.
          </p>
        )}

        {/* Generate controls */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Generate new round</p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Count</span>
              <input
                type="number"
                value={count}
                min={1}
                max={8}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={generating}
                className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <span className="text-xs text-gray-500">Anchor URL or local path (optional)</span>
              <input
                type="text"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                placeholder="https://… or C:\path\to\file.jpg"
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                disabled={generating}
              />
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <span className="text-xs text-gray-500">Note / critique (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. rougher framing, less polished"
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={generating}
              />
            </label>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={handleTogglePrompt}
              disabled={generating}
              className="text-xs text-blue-500 hover:underline disabled:opacity-40"
            >
              {showPrompt ? 'Hide prompt' : 'Preview / edit prompt'}
            </button>
            {showPrompt && (
              <div className="mt-2 space-y-1.5">
                {promptLoading ? (
                  <p className="text-xs text-gray-400">Loading prompt…</p>
                ) : (
                  <>
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      rows={12}
                      disabled={generating}
                      className="w-full px-3 py-2 text-xs font-mono border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 resize-y"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        Editing this prompt overrides the default. Changes are not saved permanently.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setPromptText(''); loadPromptPreview(); }}
                        className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap ml-3"
                      >
                        Reset to default
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {log && (
            <pre
              ref={logRef}
              className="log-pane mt-2 bg-slate-950 text-slate-300 text-xs font-mono rounded-md p-3 max-h-40 overflow-y-auto whitespace-pre-wrap"
            >
              {log}
            </pre>
          )}
        </div>

        {/* Past rounds */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Past rounds (newest first)</p>
          {familyState.rounds.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-6">No rounds yet — click Generate to create the first batch.</p>
          ) : (
            <div className="space-y-3">
              {familyState.rounds.map((round) => (
                <RoundCard
                  key={round.roundNumber}
                  round={round}
                  onPromote={handlePromote}
                  onSetAnchor={(path) => setAnchor(path)}
                  onZoom={onZoom}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoundCard({ round, onPromote, onSetAnchor, onZoom }: {
  round: RoundInfo;
  onPromote: (path: string) => void;
  onSetAnchor: (path: string) => void;
  onZoom: (src: string) => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const args = round.argsJson as Record<string, string> | null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">Round {round.roundNumber}</span>
        <span className="text-xs text-gray-400">{round.candidates.length} candidate(s)</span>
      </div>

      {(args?.note || args?.anchor) && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 space-y-0.5">
          {args.note && <p><span className="font-semibold">Note:</span> &ldquo;{args.note}&rdquo;</p>}
          {args.anchor && <p className="font-mono truncate"><span className="font-semibold font-sans">Anchor:</span> {args.anchor}</p>}
        </div>
      )}

      <div className="p-4">
        {round.candidates.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-4">No candidates in this round.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {round.candidates.map((c) => (
              <CandidateCard
                key={c.filename}
                candidate={c}
                onPromote={() => onPromote(c.fsPath)}
                onSetAnchor={() => onSetAnchor(c.fsPath)}
                onZoom={() => onZoom(c.relativeUrl)}
              />
            ))}
          </div>
        )}

        {round.promptText && (
          <div className="mt-3">
            <button
              onClick={() => setShowPrompt((v) => !v)}
              className="text-xs text-blue-500 hover:underline"
            >
              {showPrompt ? 'Hide prompt' : 'View prompt'}
            </button>
            {showPrompt && (
              <pre className="mt-2 bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {round.promptText}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({ candidate, onPromote, onSetAnchor, onZoom }: {
  candidate: CandidateInfo;
  onPromote: () => void;
  onSetAnchor: () => void;
  onZoom: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-zoom-in"
        onClick={onZoom}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={candidate.relativeUrl}
          alt={candidate.filename}
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />
      </div>
      <p className="text-[10px] text-gray-400 truncate text-center">{candidate.filename}</p>
      <button
        onClick={onPromote}
        className="w-full py-1 text-xs font-semibold bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
      >
        Promote
      </button>
      <button
        onClick={onSetAnchor}
        className="w-full py-1 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
      >
        Use as anchor
      </button>
    </div>
  );
}
