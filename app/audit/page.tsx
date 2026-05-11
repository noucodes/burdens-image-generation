'use client';

import { useCallback, useState } from 'react';
import { GapReport, SkuAuditRow } from '@/lib/types';
import PageHeader from '@/components/PageHeader';

type FilterStatus = 'all' | 'needs_generation' | 'no_main_image' | 'complete';

const STATUS_LABELS: Record<string, string> = {
  complete: 'Complete',
  needs_generation: 'Needs generation',
  no_main_image: 'Missing main',
  not_found: 'Not found',
};

const STATUS_STYLES: Record<string, string> = {
  complete: 'bg-green-100 text-green-700',
  needs_generation: 'bg-amber-100 text-amber-700',
  no_main_image: 'bg-red-100 text-red-700',
  not_found: 'bg-gray-100 text-gray-600',
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function AuditPage() {
  const [report, setReport] = useState<GapReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');

  const runAudit = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/audit', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReport(data as GapReport);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) runAudit(file);
  }, [runAudit]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) runAudit(file);
    e.target.value = '';
  }, [runAudit]);

  const filteredRows: SkuAuditRow[] = report
    ? report.rows.filter((r) => {
        if (filter !== 'all' && r.status !== filter) return false;
        if (search && !r.sku.toLowerCase().includes(search.toLowerCase()) &&
            !r.productTitle?.toLowerCase().includes(search.toLowerCase()) &&
            !r.productType?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
    : [];

  return (
    <div className="p-8 max-w-5xl w-full mx-auto">
      <PageHeader title="Audit" subtitle="Upload your product spreadsheet to identify missing images" />

      {/* Upload zone */}
      <div
        className={[
          'border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer mb-6',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('xlsx-input')?.click()}
      >
        <input
          id="xlsx-input"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 font-medium">Parsing spreadsheet…</p>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3 text-gray-300">◈</div>
            <p className="font-medium text-gray-700">Drop your XLSX file here</p>
            <p className="text-sm text-gray-400 mt-1">or click to browse · accepts .xlsx and .xls</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      {report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total SKUs', value: report.totalSkus, color: 'text-gray-900' },
              { label: 'Complete', value: report.complete, color: 'text-green-600' },
              { label: 'Needs Generation', value: report.needsGeneration, color: 'text-amber-600' },
              { label: 'Missing Main', value: report.missingMain, color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Slot breakdown */}
          {(() => {
            const slotMisses = { 2: 0, 3: 0, 4: 0 };
            for (const r of report.rows) {
              if (r.status !== 'needs_generation') continue;
              for (const slot of r.missingSlots) {
                if (slot === 1) continue;
                slotMisses[slot as 2 | 3 | 4]++;
              }
            }
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">AI-generatable gaps</h3>
                <div className="flex gap-6">
                  {[
                    { slot: 2, label: 'Detail' },
                    { slot: 3, label: 'Lifestyle' },
                    { slot: 4, label: 'Scale (manual)' },
                  ].map(({ slot, label }) => (
                    <div key={slot}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`text-2xl font-bold ${slot === 4 ? 'text-gray-400' : 'text-blue-600'}`}>
                        {slotMisses[slot as 2 | 3 | 4]}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  {slotMisses[2] + slotMisses[3]} image(s) ready for AI generation ·
                  Slot 4 (Scale) requires dimension data and is handled separately
                </p>
              </div>
            );
          })()}

          {/* Table controls */}
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <input
              type="text"
              placeholder="Search SKU, title, or family…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-1">
              {(['all', 'needs_generation', 'no_main_image', 'complete'] as FilterStatus[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={[
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    filter === f
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {f === 'all' ? 'All' : STATUS_LABELS[f]}
                  {f !== 'all' && (
                    <span className="ml-1.5 opacity-60">
                      {report.rows.filter((r) => r.status === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* SKU table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">SKU</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Family</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Slots</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No results</td>
                  </tr>
                ) : filteredRows.map((row) => (
                  <tr key={row.sku} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{row.sku}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[240px] truncate">{row.productTitle ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.productType ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((s) => (
                          <span
                            key={s}
                            title={`Slot ${s}`}
                            className={[
                              'w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center',
                              row.existingSlots.includes(s as 1 | 2 | 3 | 4)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-300',
                            ].join(' ')}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                Showing {filteredRows.length} of {report.rows.length} SKUs
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
