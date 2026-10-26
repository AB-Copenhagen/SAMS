'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { StaffPreferences } from '../lib/staff-preferences';

// Same as the Descope flow component in DescopeLoginForm.tsx: UserProfile wraps a custom element
// (customElements.define(), browser-only). Rendering it directly — as this previously did — lets
// Next.js SSR a placeholder for it, and the client then hydrates into the real custom element,
// which React can't reconcile; the resulting hydration error left the widget in a broken state
// that then raced the Descope SDK's own session rehydration and crashed. ssr:false defers mounting
// until after hydration, avoiding both.
const UserProfile = dynamic(
  () => import('@descope/react-sdk').then((mod) => mod.UserProfile),
  { ssr: false, loading: () => <p>Loading profile…</p> }
);

type LandingPageChoice = { value: string; label: string; minRole?: 'STAFF' | 'ADMIN' };

export default function ProfileClient({
  name: initialName,
  preferences,
  pageSizeOptions,
  landingPageChoices,
}: {
  name: string;
  preferences: StaffPreferences;
  pageSizeOptions: number[];
  landingPageChoices: LandingPageChoice[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const [name, setName] = useState(initialName);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [nameError, setNameError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setStatus('idle');
    const res = await fetch('/api/profile/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setStatus(res.ok ? 'saved' : 'error');
    if (res.ok) router.refresh(); // picks up the new theme cookie in the root layout
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Name is required');
      return;
    }
    setSavingName(true);
    setNameStatus('idle');
    setNameError(null);
    const res = await fetch('/api/profile/name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    setSavingName(false);
    if (res.ok) {
      setName(trimmed);
      setEditingName(false);
      setNameStatus('saved');
      router.refresh(); // picks up the new name in the top header
    } else {
      const body = await res.json().catch(() => null);
      setNameError(body?.message ?? "Couldn't save name. Try again.");
      setNameStatus('error');
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">Account details</div>

        <div className="field">
          <label htmlFor="profile-name">Name</label>
          {editingName ? (
            <div className="meta-row">
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={savingName}
                autoFocus
              />
              <button className="btn-primary" type="button" onClick={saveName} disabled={savingName}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setEditingName(false); setName(initialName); setNameError(null); }}
                disabled={savingName}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="meta-row">
              <span>{name || '(no name set)'}</span>
              <button type="button" onClick={() => setEditingName(true)}>Edit</button>
            </div>
          )}
        </div>

        {nameStatus === 'saved' && !editingName && <div className="alert alert-success">Name saved.</div>}
        {nameError && <div className="alert alert-error">{nameError}</div>}
      </div>

      <div className="card">
        <div className="card-header">Display preferences</div>

        <div className="meta-row">
          <div className="field">
            <label htmlFor="pref-theme">Theme</label>
            <select
              id="pref-theme"
              value={form.theme ?? ''}
              onChange={(e) => setForm({ ...form, theme: (e.target.value || null) as StaffPreferences['theme'] })}
            >
              <option value="">System default</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="pref-page-size">Default page size</label>
            <select
              id="pref-page-size"
              value={form.defaultPageSize ?? ''}
              onChange={(e) => setForm({ ...form, defaultPageSize: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Each page's own default</option>
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="pref-landing-page">Default landing page</label>
            <select
              id="pref-landing-page"
              value={form.defaultLandingPage ?? ''}
              onChange={(e) => setForm({ ...form, defaultLandingPage: e.target.value || null })}
            >
              <option value="">Default</option>
              {landingPageChoices.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {status === 'saved' && <div className="alert alert-success">Preferences saved.</div>}
        {status === 'error' && <div className="alert alert-error">Couldn't save preferences. Try again.</div>}

        <button className="btn-primary" type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>

      <UserProfile
        widgetId="user-profile-widget"
        onLogout={() => router.push('/login')}
      />
    </>
  );
}
