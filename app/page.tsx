'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GapReport } from '@/lib/types';
import PageHeader from '@/components/PageHeader';

interface ReviewStats {
  total: number;
  approved: number;
  items: unknown[];
}

interface GenerateStats {
  done: number;
  blocked: number;
  errored: number;
  dailyUsage: { date: string; count: number };
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-sm text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ActionCard({ href, title, desc, badge }: { href: string; title: string; desc: string; badge?: string }) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{title}</span>
        {badge && (
          <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">{badge}</span>
        )}
      </div>
      <p className="text-sm text-gray-500">{desc}</p>
    </Link>
  );
}

export default function Dashboard() {
  const [gap, setGap] = useState<GapReport | null>(null);
  const [review, setReview] = useState<ReviewStats | null>(null);
  const [generate, setGenerate] = useState<GenerateStats | null>(null);

  useEffect(() => {
    fetch('/api/audit').then((r) => r.ok ? r.json() : null).then((d) => d && !d.error && setGap(d)).catch(() => {});
    fetch('/api/review/queue').then((r) => r.ok ? r.json() : null).then((d) => d && setReview(d)).catch(() => {});
    fetch('/api/generate').then((r) => r.ok ? r.json() : null).then((d) => d && !d.error && setGenerate(d)).catch(() => {});
  }, []);

  const pendingReview = review ? review.items.length : null;

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <PageHeader title="Dashboard" subtitle="AI product image generation for Burdens trade catalogue" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total SKUs"
          value={gap?.totalSkus ?? '—'}
          sub={gap ? `as of last audit` : 'run audit to begin'}
        />
        <StatCard
          label="Needs Generation"
          value={gap?.needsGeneration ?? '—'}
          color={gap?.needsGeneration ? 'text-amber-600' : undefined}
          sub={gap ? `${gap.complete} complete` : undefined}
        />
        <StatCard
          label="Generated"
          value={generate?.done ?? '—'}
          color={generate?.done ? 'text-blue-600' : undefined}
          sub={generate ? `${generate.dailyUsage.count}/500 used today` : undefined}
        />
        <StatCard
          label="Pending Review"
          value={pendingReview ?? '—'}
          color={pendingReview ? 'text-orange-600' : undefined}
          sub={review ? `${review.approved} approved` : undefined}
        />
      </div>

      {/* Gap breakdown */}
      {gap && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Gap Report Overview</h3>
          <div className="space-y-3">
            {[
              { label: 'Complete (4/4 images)', count: gap.complete, color: 'bg-green-500', max: gap.totalSkus },
              { label: 'Needs AI generation', count: gap.needsGeneration, color: 'bg-amber-500', max: gap.totalSkus },
              { label: 'Missing main (manual fix needed)', count: gap.missingMain, color: 'bg-red-400', max: gap.totalSkus },
            ].map(({ label, count, color, max }) => (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Last audited {new Date(gap.generatedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* Quick actions */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Workflow</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ActionCard
          href="/audit"
          title="1 · Audit"
          desc="Upload your product spreadsheet to identify missing images across all SKUs."
        />
        <ActionCard
          href="/generate"
          title="2 · Generate"
          desc="Run AI generation for missing Detail and Lifestyle images using Gemini."
          badge={gap?.needsGeneration ? `${gap.needsGeneration} ready` : undefined}
        />
        <ActionCard
          href="/review"
          title="3 · Review"
          desc="Approve or reject generated images side-by-side with the original product photo."
          badge={pendingReview ? `${pendingReview} pending` : undefined}
        />
        <ActionCard
          href="/refine"
          title="4 · Refine"
          desc="Manage style reference images per product family to improve generation quality."
        />
      </div>
    </div>
  );
}
