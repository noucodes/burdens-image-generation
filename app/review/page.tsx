'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface ReviewItem {
  sku: string;
  slot: number;
  slotName: string;
  imageUrl: string;
  mainImageUrl: string | null;
  productTitle: string | null;
  productType: string | null;
  generatedAt: string;
  prompt: string;
}

interface QueueResponse {
  items: ReviewItem[];
  approved: number;
  total: number;
}

function ImageCard({ item, onApprove, onReject, onZoom }: {
  item: ReviewItem;
  onApprove: () => void;
  onReject: () => void;
  onZoom: (src: string) => void;
}) {
  const [acting, setActing] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const act = async (kind: 'approve' | 'reject') => {
    setActing(true);
    const endpoint = kind === 'approve' ? '/api/review/approve' : '/api/review/reject';
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: item.sku, slot: item.slot }),
    });
    kind === 'approve' ? onApprove() : onReject();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Images */}
      <div className="grid grid-cols-2 gap-0">
        <div className="relative">
          <p className="absolute top-2 left-2 z-10 text-[10px] font-semibold uppercase tracking-wider bg-black/60 text-white px-1.5 py-0.5 rounded">Source</p>
          {item.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.mainImageUrl}
              alt="Source product"
              className="w-full aspect-square object-cover cursor-zoom-in bg-gray-100"
              onClick={() => onZoom(item.mainImageUrl!)}
            />
          ) : (
            <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-gray-300 text-sm">No image</div>
          )}
        </div>
        <div className="relative border-l border-gray-200">
          <p className="absolute top-2 left-2 z-10 text-[10px] font-semibold uppercase tracking-wider bg-blue-600/90 text-white px-1.5 py-0.5 rounded">{item.slotName}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={`Generated ${item.slotName}`}
            className="w-full aspect-square object-cover cursor-zoom-in bg-gray-100"
            onClick={() => onZoom(item.imageUrl)}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-gray-900 truncate">{item.sku}_{item.slot}.jpg</p>
            {item.productTitle && <p className="text-xs text-gray-500 truncate mt-0.5">{item.productTitle}</p>}
            {item.productType && <p className="text-[11px] text-gray-400 truncate">{item.productType}</p>}
          </div>
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className="text-[11px] text-blue-500 hover:underline whitespace-nowrap shrink-0"
          >
            {showPrompt ? 'hide prompt' : 'view prompt'}
          </button>
        </div>

        {showPrompt && (
          <pre className="text-[10px] font-mono bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap max-h-28 overflow-y-auto mb-3 text-gray-600">
            {item.prompt}
          </pre>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => act('reject')}
            disabled={acting}
            className="flex-1 py-2 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => act('approve')}
            disabled={acting}
            className="flex-1 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review/queue');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAction = useCallback(() => {
    load();
  }, [load]);

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <PageHeader
        title="Review"
        subtitle="Approve or reject generated images before upload"
        actions={data && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">{data.approved} approved</span>
            <span className={`font-semibold ${data.items.length > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
              {data.items.length} pending
            </span>
            <button
              onClick={load}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Refresh
            </button>
          </div>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-24 text-center">
          <div className="text-5xl mb-4 text-gray-200">◉</div>
          <p className="font-semibold text-gray-700">Queue is empty</p>
          <p className="text-sm text-gray-400 mt-1">
            {data?.approved ? `${data.approved} image(s) have been approved.` : 'Generate images first, then come back to review them.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.items.map((item) => (
            <ImageCard
              key={`${item.sku}_${item.slot}`}
              item={item}
              onApprove={handleAction}
              onReject={handleAction}
              onZoom={setLightbox}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}
