'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface SettingsData {
  GEMINI_API_KEY: string;
  GCP_PROJECT_ID: string;
  GCP_REGION: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
  credentialsStatus: 'missing' | 'found' | 'invalid';
  sources: Record<string, 'env' | 'settings' | 'none'>;
}

interface TestResult {
  ok: boolean;
  backend?: string;
  step?: string;
  error?: string;
  hint?: string;
  projectId?: string;
  region?: string;
}

const REGIONS = [
  'us-central1',
  'us-east1',
  'us-west1',
  'europe-west1',
  'europe-west4',
  'asia-southeast1',
  'australia-southeast1',
];

function SourceBadge({ source }: { source: 'env' | 'settings' | 'none' }) {
  if (source === 'env') {
    return <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">from .env</span>;
  }
  if (source === 'settings') {
    return <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">from settings</span>;
  }
  return null;
}

function StatusDot({ status }: { status: 'missing' | 'found' | 'invalid' }) {
  const cfg = {
    found: { color: 'bg-green-500', label: 'File found' },
    missing: { color: 'bg-red-400', label: 'Not found' },
    invalid: { color: 'bg-amber-400', label: 'Invalid file' },
  }[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
      {cfg.label}
    </span>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [form, setForm] = useState({ GEMINI_API_KEY: '', GCP_PROJECT_ID: '', GCP_REGION: 'us-central1', GOOGLE_APPLICATION_CREDENTIALS: './gcp-credentials.json' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json() as SettingsData;
      setSettings(data);
      setForm({
        GEMINI_API_KEY: data.GEMINI_API_KEY,
        GCP_PROJECT_ID: data.GCP_PROJECT_ID,
        GCP_REGION: data.GCP_REGION,
        GOOGLE_APPLICATION_CREDENTIALS: data.GOOGLE_APPLICATION_CREDENTIALS,
      });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveMsg({ type: 'ok', text: 'Settings saved.' });
      await load();
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test');
      setTestResult(await res.json() as TestResult);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleCredentialsUpload = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/settings/credentials', { method: 'POST', body: form });
      const data = await res.json() as { ok?: boolean; error?: string; projectId?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUploadMsg({ type: 'ok', text: `Credentials saved${data.projectId ? ` — project: ${data.projectId}` : ''}.` });
      await load();
    } catch (err) {
      setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
    }
  };

  const envOverrideWarning = Object.entries(settings?.sources ?? {}).some(([, v]) => v === 'env');

  return (
    <div className="p-8 max-w-2xl w-full mx-auto">
      <PageHeader title="Settings" subtitle="Configure Google Cloud credentials for AI image generation" />

      {envOverrideWarning && (
        <div className="mb-5 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
          Some values are loaded from <code className="font-mono">.env.local</code> and cannot be overridden here. Remove them from .env.local to manage them in settings instead.
        </div>
      )}

      {/* AI Studio (free) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-800">Google AI Studio</h3>
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Free tier · recommended</span>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          10–15 RPM free. Get a key at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
            aistudio.google.com/apikey
          </a>
          {' '}— no billing required. When set, this takes priority over Vertex AI.
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          API Key
          {settings && <SourceBadge source={settings.sources.GEMINI_API_KEY as 'env' | 'settings' | 'none'} />}
        </label>
        <input
          type="password"
          value={form.GEMINI_API_KEY}
          onChange={(e) => setForm((f) => ({ ...f, GEMINI_API_KEY: e.target.value }))}
          placeholder="AIza…"
          disabled={settings?.sources.GEMINI_API_KEY === 'env'}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-50 disabled:text-gray-400"
        />
      </div>

      {/* GCP Settings */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Vertex AI (service account)</h3>
          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">fallback if no API key</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project ID
              {settings && <SourceBadge source={settings.sources.GCP_PROJECT_ID as 'env' | 'settings' | 'none'} />}
            </label>
            <input
              type="text"
              value={form.GCP_PROJECT_ID}
              onChange={(e) => setForm((f) => ({ ...f, GCP_PROJECT_ID: e.target.value }))}
              placeholder="my-project-id"
              disabled={settings?.sources.GCP_PROJECT_ID === 'env'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Region
              {settings && <SourceBadge source={settings.sources.GCP_REGION as 'env' | 'settings' | 'none'} />}
            </label>
            <select
              value={form.GCP_REGION}
              onChange={(e) => setForm((f) => ({ ...f, GCP_REGION: e.target.value }))}
              disabled={settings?.sources.GCP_REGION === 'env'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">us-central1 has the broadest model availability</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Credentials file path
              {settings && <SourceBadge source={settings.sources.GOOGLE_APPLICATION_CREDENTIALS as 'env' | 'settings' | 'none'} />}
            </label>
            <input
              type="text"
              value={form.GOOGLE_APPLICATION_CREDENTIALS}
              onChange={(e) => setForm((f) => ({ ...f, GOOGLE_APPLICATION_CREDENTIALS: e.target.value }))}
              placeholder="./gcp-credentials.json"
              disabled={settings?.sources.GOOGLE_APPLICATION_CREDENTIALS === 'env'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Credentials file upload */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Service account key</h3>
          {settings && <StatusDot status={settings.credentialsStatus} />}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Upload the JSON key file for your GCP service account. The account needs the{' '}
          <strong className="text-gray-700">Vertex AI User</strong> role.
          The file is stored at the path configured above.
        </p>

        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCredentialsUpload(f); }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCredentialsUpload(f); e.target.value = ''; }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Uploading…</span>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">Drop your service account JSON here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse</p>
            </>
          )}
        </div>

        {uploadMsg && (
          <p className={`mt-3 text-sm ${uploadMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {uploadMsg.text}
          </p>
        )}

        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">How to get your credentials file:</p>
          <p>1. GCP Console → IAM &amp; Admin → Service Accounts</p>
          <p>2. Create or select an account with the <strong>Vertex AI User</strong> role</p>
          <p>3. Keys tab → Add Key → Create new key → JSON → Download</p>
        </div>
      </div>

      {/* Connection test */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-3">Test connection</h3>
        <p className="text-sm text-gray-500 mb-4">
          Verifies that your credentials are valid and Vertex AI is reachable. Uses a text-only call — no quota consumed.
        </p>

        <button
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 disabled:opacity-50 transition-colors"
        >
          {testing ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Testing…
            </span>
          ) : 'Test connection'}
        </button>

        {testResult && (
          <div className={`mt-4 p-4 rounded-lg border text-sm ${testResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {testResult.ok ? (
              <div>
                <p className="font-semibold text-green-800">Connection successful</p>
                <p className="text-green-700 mt-1">
                  {testResult.backend ?? 'Vertex AI'}
                  {testResult.projectId && ` · Project: ${testResult.projectId}`}
                  {testResult.region && ` · Region: ${testResult.region}`}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold text-red-800">
                  Failed at step: <span className="font-mono">{testResult.step}</span>
                </p>
                <p className="text-red-700">{testResult.error}</p>
                {testResult.hint && (
                  <p className="text-red-600 text-xs mt-2"><strong>Hint:</strong> {testResult.hint}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
