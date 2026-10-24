'use client';

import { useState } from 'react';

// Shared collapsed-by-default card for the customer detail sidebar (Identity & consent, Goliath,
// Shopify, MailerLite) — each section opens to a one-line `summary` so the page reads as a quick
// scan by default, with full detail a click away rather than four always-expanded cards stacked
// on load.
export default function CollapsibleCard({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card" style={{ paddingBottom: open ? 20 : 16 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="collapsible-card-toggle">
        <span className="card-header" style={{ margin: 0, padding: 0, border: 'none' }}>{title}</span>
        <span className="collapsible-card-right">
          {!open && <span className="collapsible-card-summary">{summary}</span>}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}
