import { NextResponse } from 'next/server';
import {
  resolveShareTarget,
  getPublicCollectionByToken,
  collectionEmbeddable,
  getOrCreateEmbedToken,
} from '../../../lib/collections';

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;

function appOrigin(): string {
  return (process.env.PUBLIC_SHARE_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
}

/** Matches `/s/:token` (collection) or `/s/:token/:assetId` (asset) on this app's own host —
 * never resolves an arbitrary external URL, just normalizes the two share-link shapes. */
function parseShareUrl(rawUrl: string): { token: string; assetId: string | null } | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const self = appOrigin();
  if (self) {
    let selfHost: string;
    try {
      selfHost = new URL(self).host;
    } catch {
      selfHost = '';
    }
    if (selfHost && parsed.host !== selfHost) return null;
  }

  const match = parsed.pathname.match(/^\/s\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return { token: match[1], assetId: match[2] ?? null };
}

type OembedResolution = { targetType: 'asset' | 'collection'; targetId: string; title: string } | null;

/** Mirrors resolveShareTarget/getPublicCollectionByToken's own gates (password, isPublic,
 * expiry) — an oEmbed consumer gets nothing it couldn't already reach by visiting the share link
 * directly, and a password-gated collection is never embeddable (collectionEmbeddable), same as
 * self-serve issuance. */
async function resolveShareUrlTarget(token: string, assetId: string | null): Promise<OembedResolution> {
  if (assetId) {
    const target = await resolveShareTarget(token, assetId);
    if (!target || target.kind === 'password-required') return null;
    return { targetType: 'asset', targetId: target.asset.id, title: target.asset.title ?? target.asset.objectKey };
  }

  const collection = await getPublicCollectionByToken(token);
  if (!collection || !collection.isPublic || !collectionEmbeddable(collection)) return null;
  return { targetType: 'collection', targetId: collection.id, title: collection.name };
}

// Public, unauthenticated — mirrors the share link's own access level (the `url` being resolved
// is itself a public share link; this just hands back the <iframe> embed code for it, same as
// any oEmbed provider). Discovered via <link rel="alternate" type="application/json+oembed">
// on app/s/[token]/page.tsx and app/s/[token]/[assetId]/page.tsx (Phase 5 completes this).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const format = searchParams.get('format');
  if (format && format !== 'json') {
    return NextResponse.json({ message: 'Only json format is supported' }, { status: 501 });
  }
  if (!url) return NextResponse.json({ message: 'url is required' }, { status: 400 });

  const parsed = parseShareUrl(url);
  if (!parsed) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const resolved = await resolveShareUrlTarget(parsed.token, parsed.assetId);
  if (!resolved) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  // "oembed-auto": distinguishes an oEmbed-minted token from one a staff member issued via
  // Configure/the asset or collection UI (app/api/embed-tokens) — same table, same lifecycle,
  // just a different createdBy so it's traceable later if needed.
  const embedToken = await getOrCreateEmbedToken(resolved.targetType, resolved.targetId, 'oembed-auto');
  const embedUrl = `${appOrigin()}/embed/${embedToken}`;
  const html = `<iframe src="${embedUrl}" data-sams-embed width="${DEFAULT_WIDTH}" height="${DEFAULT_HEIGHT}" style="width:100%;border:0;" allowfullscreen></iframe>`;

  return NextResponse.json({
    version: '1.0',
    type: 'rich',
    provider_name: 'AB Media DAM',
    provider_url: appOrigin(),
    title: resolved.title,
    html,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
}
