'use client';

import { useCallback, useEffect, useState } from 'react';
import SlotSection from '@/components/SlotSection';
import PageHeader from '@/components/PageHeader';
import type { AppState } from '@/lib/refine-filesystem';

export default function RefinePage() {
  const [families, setFamilies] = useState<string[]>([]);
  const [selectedFamily, setSelectedFamily] = useState('');
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/refine/families')
      .then((r) => r.json() as Promise<string[]>)
      .then((list) => {
        setFamilies(list);
        if (list.length > 0) setSelectedFamily(list[0]);
      })
      .catch((err) => setError('Could not load families: ' + (err as Error).message));
  }, []);

  const loadState = useCallback(async (family = selectedFamily) => {
    if (!family) return;
    setLoadingState(true);
    setError(null);
    try {
      const res = await fetch(`/api/refine/state?family=${encodeURIComponent(family)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setAppState(await res.json() as AppState);
    } catch (err) {
      setError('Could not load state: ' + (err as Error).message);
    } finally {
      setLoadingState(false);
    }
  }, [selectedFamily]);

  useEffect(() => {
    loadState(selectedFamily);
  }, [selectedFamily]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRefresh = useCallback(() => loadState(selectedFamily), [selectedFamily, loadState]);

  return (
    <>
      <PageHeader
        title="Refine"
        subtitle="Style reference management"
        sticky
        actions={
          <>
            <label className="text-sm text-gray-500 whitespace-nowrap">Family:</label>
            <select
              value={selectedFamily}
              onChange={(e) => setSelectedFamily(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {families.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button
              onClick={() => loadState(selectedFamily)}
              disabled={loadingState}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {loadingState ? 'Loading…' : 'Refresh'}
            </button>
          </>
        }
      />

      <main className="max-w-5xl mx-auto px-8 py-6 w-full">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        {!appState && !error && (
          <div className="text-center py-24 text-gray-400 text-sm">
            {families.length === 0 ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                <span>Loading…</span>
              </div>
            ) : 'Select a family to begin.'}
          </div>
        )}

        {appState && (
          <>
            <SlotSection
              slot="lifestyle"
              familyState={appState.lifestyle}
              family={appState.family}
              onRefresh={handleRefresh}
              onZoom={setLightbox}
            />
            <SlotSection
              slot="detail"
              familyState={appState.detail}
              family={appState.family}
              onRefresh={handleRefresh}
              onZoom={setLightbox}
            />
          </>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl leading-none"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
