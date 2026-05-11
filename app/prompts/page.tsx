'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';

type PromptKey = 'PROMPT_DETAIL' | 'PROMPT_DETAIL_STYLE_REF' | 'PROMPT_LIFESTYLE' | 'PROMPT_LIFESTYLE_STYLE_REF';

interface PromptsData {
  PROMPT_DETAIL: string | null;
  PROMPT_DETAIL_STYLE_REF: string | null;
  PROMPT_LIFESTYLE: string | null;
  PROMPT_LIFESTYLE_STYLE_REF: string | null;
  defaults: Record<PromptKey, string>;
}

const LABELS: Record<PromptKey, { title: string; description: string }> = {
  PROMPT_DETAIL: {
    title: 'Detail — no style reference',
    description: 'Used when generating slot 2 (detail) images and no style reference is locked in Refine.',
  },
  PROMPT_DETAIL_STYLE_REF: {
    title: 'Detail — with style reference',
    description: 'Used when a Refine style reference is locked for this product family (slot 2).',
  },
  PROMPT_LIFESTYLE: {
    title: 'Lifestyle — no style reference',
    description: 'Used when generating slot 3 (lifestyle) images and no style reference is locked in Refine.',
  },
  PROMPT_LIFESTYLE_STYLE_REF: {
    title: 'Lifestyle — with style reference',
    description: 'Used when a Refine style reference is locked for this product family (slot 3).',
  },
};

const KEYS = Object.keys(LABELS) as PromptKey[];

export default function PromptsPage() {
  const [data, setData] = useState<PromptsData | null>(null);
  const [form, setForm] = useState<Record<PromptKey, string>>({
    PROMPT_DETAIL: '',
    PROMPT_DETAIL_STYLE_REF: '',
    PROMPT_LIFESTYLE: '',
    PROMPT_LIFESTYLE_STYLE_REF: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/prompts');
    if (!res.ok) return;
    const d = await res.json() as PromptsData;
    setData(d);
    setForm({
      PROMPT_DETAIL: d.PROMPT_DETAIL ?? d.defaults.PROMPT_DETAIL,
      PROMPT_DETAIL_STYLE_REF: d.PROMPT_DETAIL_STYLE_REF ?? d.defaults.PROMPT_DETAIL_STYLE_REF,
      PROMPT_LIFESTYLE: d.PROMPT_LIFESTYLE ?? d.defaults.PROMPT_LIFESTYLE,
      PROMPT_LIFESTYLE_STYLE_REF: d.PROMPT_LIFESTYLE_STYLE_REF ?? d.defaults.PROMPT_LIFESTYLE_STYLE_REF,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, string | undefined> = {};
      for (const key of KEYS) {
        const val = form[key].trim();
        body[key] = val === data?.defaults[key].trim() ? undefined : val || undefined;
      }
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveMsg({ type: 'ok', text: 'Prompts saved.' });
      await load();
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const resetOne = (key: PromptKey) => {
    setForm((f) => ({ ...f, [key]: data?.defaults[key] ?? '' }));
    setSaveMsg(null);
  };

  const isCustom = (key: PromptKey) =>
    data !== null && form[key].trim() !== (data.defaults[key] ?? '').trim();

  return (
    <div className="p-8 max-w-4xl w-full mx-auto">
      <PageHeader title="Prompt Templates" subtitle="Edit the prompts sent to Gemini when generating product images" />

      <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-1">
        <p className="font-medium">Available variables</p>
        <p>Use these placeholders in your prompts — they are replaced per-product at generation time:</p>
        <div className="flex flex-wrap gap-3 mt-1 font-mono text-xs">
          {['{{productTitle}}', '{{productType}}', '{{vendor}}'].map((v) => (
            <span key={v} className="bg-blue-100 px-2 py-0.5 rounded">{v}</span>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {KEYS.map((key) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="font-semibold text-gray-800">{LABELS[key].title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{LABELS[key].description}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                {isCustom(key) && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">customised</span>
                )}
                <button
                  type="button"
                  onClick={() => resetOne(key)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Reset to default
                </button>
              </div>
            </div>
            <textarea
              value={form[key]}
              onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setSaveMsg(null); }}
              rows={16}
              className="mt-3 w-full px-3 py-2.5 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y bg-gray-50"
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save all prompts'}
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {saveMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}
