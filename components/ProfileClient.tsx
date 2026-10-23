'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserProfile } from '@descope/react-sdk';
import type { StaffPreferences } from '../lib/staff-preferences';

type LandingPageChoice = { value: string; label: string; adminOnly?: boolean };

export default function ProfileClient({
  preferences,
  pageSizeOptions,
  landingPageChoices,
}: {
  preferences: StaffPreferences;
  pageSizeOptions: number[];
  landingPageChoices: LandingPageChoice[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

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

  return (
    <>
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
