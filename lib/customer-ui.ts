// Shared presentation helpers for customer-facing pages (app/customers/list, app/customers/[id]).

const AVATAR_COLORS = [
  'var(--avatar-color-1)', 'var(--avatar-color-2)', 'var(--avatar-color-3)',
  'var(--avatar-color-4)', 'var(--avatar-color-5)', 'var(--avatar-color-6)',
];

// Deterministic per-customer color so the same row always gets the same avatar color across
// page loads — not cryptographic, just needs to be stable and spread across the palette.
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function avatarInitial(name: string | null, email: string | null): string {
  const source = name || email || '?';
  return source.charAt(0).toUpperCase();
}

export function segmentNames(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

// Shopify spend is tracked to the cent (lib/shopify.ts), but nothing here needs that precision —
// rounds up to the nearest whole DKK, formatted with Danish thousands separators.
export function formatSpend(amount: number): string {
  return `${new Intl.NumberFormat('da-DK').format(Math.ceil(amount))} DKK`;
}
