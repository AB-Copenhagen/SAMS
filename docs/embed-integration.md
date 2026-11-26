# Embedding AB Media DAM content on another site

This document is for a developer (or coding agent) implementing embed support on a
**consuming** site — e.g. www.ab.dk's CMS — not for staff using the DAM itself.
Source: `AB-Copenhagen/SAMS` (media.ab.dk), gh-123 (video/image/collection embeds), gh-128
(playlist embeds).

It covers:

- What gets embedded (video, image, collection/gallery, or playlist) and how
- The two ways to get embed code: oEmbed auto-discovery, or a direct `<iframe>` snippet
- The `player.js` widget (responsive resizing, play/pause control)
- Domain allowlisting, and what "it doesn't show up" usually means

## How it works, in one paragraph

A staff member in the DAM generates an **embed link** for a video, image, collection, or
playlist. That link is a chromeless page at `https://media.ab.dk/embed/{token}`. Any page that
embeds it in an `<iframe>` — on an **allowlisted domain only** — will render it with no DAM
navigation/header, and (if `player.js` is included) will auto-resize to fit its content and
expose a small JS API.

Embed links are **independent of, and separate from**, the DAM's normal public share links
(`media.ab.dk/s/...`). They don't expire on a schedule; they work until a staff member
explicitly revokes them.

## 1. Domain allowlisting (do this first)

Framing is restricted by a `Content-Security-Policy: frame-ancestors` header — only
origins on an allowlist may embed `/embed/{token}` in an `<iframe>` at all. As of this
writing the allowlist is **`https://www.ab.dk` only** (one single origin, not a
general mechanism yet).

**If your site isn't `www.ab.dk`, ask a SAMS maintainer to add your origin before
you integrate anything** — your browser will otherwise silently refuse to render the
iframe and log a CSP violation in the console (nothing on your side will look broken;
the DAM will just render as a blank frame).

## 2. Getting embed code: two ways

### Option A — oEmbed auto-discovery (recommended for "paste a link" fields)

If your CMS supports oEmbed (most do — WordPress, Discourse, Drupal, Strapi plugins,
etc.), this is the path of least effort: a content editor pastes a normal DAM **share
link** (`https://media.ab.dk/s/{token}` or `https://media.ab.dk/s/{token}/{assetId}`)
into a rich-text field, and your CMS's existing oEmbed client resolves it automatically.

If you're implementing the oEmbed client yourself:

1. The share page declares its oEmbed endpoint via a standard discovery `<link>` tag:
   ```html
   <link rel="alternate" type="application/json+oembed"
         href="https://media.ab.dk/api/oembed?url=https%3A%2F%2Fmedia.ab.dk%2Fs%2FabC123" />
   ```
2. Or skip discovery and call the endpoint directly:
   ```
   GET https://media.ab.dk/api/oembed?url={url-encoded share link}
   ```
3. Response (`application/json`):
   ```json
   {
     "version": "1.0",
     "type": "rich",
     "provider_name": "AB Media DAM",
     "provider_url": "https://media.ab.dk",
     "title": "Match highlights vs FC Nordsjælland",
     "html": "<iframe src=\"https://media.ab.dk/embed/oP1JBeF3WEHiuISixi\" data-sams-embed width=\"640\" height=\"360\" style=\"width:100%;border:0;\" allowfullscreen></iframe>",
     "width": 640,
     "height": 360
   }
   ```
4. Insert the `html` field as-is into the page. `width`/`height` are just the
   starting size — see "Responsive sizing" below for how it adjusts after that.

Notes:
- `url` must be an actual DAM share link (`/s/{token}` or `/s/{token}/{assetId}`) on
  `media.ab.dk` — you can't resolve an arbitrary URL through this endpoint.
- **Playlists have no oEmbed path.** A playlist has no public share-link equivalent (it's a
  purely internal DAM concept), so there's nothing for `url` to point at. A playlist embed is
  always obtained as a direct embed code (Option B) from the DAM's Playlists UI — there's no
  "paste a link" shortcut for it today.
- The endpoint mints an embed token automatically the first time it's called for a
  given share link (reusing the same one on repeat calls) — a staff member does not
  need to have pre-generated an embed link for oEmbed to work, as long as the share
  link itself is valid (not expired, not password-protected — see Troubleshooting).
- `format` is implicitly `json`; passing `format=xml` returns `501 Not Implemented`.

### Option B — direct `<iframe>` embed code

If a staff member hands you an embed code directly from the DAM's "Embed" panel, it
looks like this — use it verbatim:

```html
<iframe src="https://media.ab.dk/embed/oP1JBeF3WEHiuISixi"
        data-sams-embed
        style="width:100%;border:0;"
        allowfullscreen></iframe>
<script src="https://media.ab.dk/embed/player.js" async></script>
```

The `data-sams-embed` attribute is required — `player.js` uses it to find which
iframes on the page it should manage. If you're templating this yourself (e.g.
storing just the embed token and generating the HTML), reproduce this exact shape.

## 3. The `player.js` widget

Include it once per page (not once per embed) — safe to include even if the page has
no embeds, and handles any number of embeds on one page:

```html
<script src="https://media.ab.dk/embed/player.js" async></script>
```

What it does automatically, with zero configuration:
- **Responsive resizing.** Each embed reports its own rendered height; the widget
  resizes that specific `<iframe>` to match. You don't need to guess an aspect ratio
  or wrap it in a padding-hack responsive container — just don't set a fixed `height`
  on the `<iframe>` (the inline `style="width:100%;border:0;"` above is sufficient;
  height is managed at runtime).

What it exposes, if you need programmatic control (optional — most integrations
won't need this):

```js
// Target a specific iframe, or omit to target the first data-sams-embed on the page
SamsEmbed.play(iframeEl);
SamsEmbed.pause(iframeEl);

// Fires whenever any embed resizes, with the iframe and its new height in px
SamsEmbed.onResize(function (iframe, height) {
  console.log('embed resized', iframe, height);
});
```

This only does anything meaningful for a **video** or **playlist** embed (play/pause
control). For an image or collection embed, `play`/`pause` are no-ops. For a playlist,
`play`/`pause` always control whichever item is currently playing — there's no "jump to
track N" or "skip" call; playback advances on its own as each video ends.

## 4. What each embed type looks like

| DAM target | What renders in the iframe |
|---|---|
| A single video | The video player, no DAM chrome, adaptive playback |
| A single image | The image, full width |
| A collection | A thumbnail grid; clicking a thumbnail expands it in place (image or video) |
| A playlist | A video player that plays each video in the playlist's set order, automatically advancing to the next one when the current one ends. Video-only — a playlist can't contain images. |

All four resize automatically via `player.js` — you don't need different markup per type.

## 5. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Blank iframe, CSP violation in your browser console mentioning `frame-ancestors` | Your domain isn't on the allowlist yet — see step 1. |
| Iframe loads a "page not found" | The embed token was revoked, or never existed (typo in the token/URL). Ask whoever generated it to check. |
| `/api/oembed` returns 404 | The `url` you passed isn't a valid, currently-accessible DAM share link — e.g. it's expired, or (for a collection) password-protected. oEmbed only resolves what a visitor could already reach by clicking the share link directly. |
| `/api/oembed` returns 400 | Missing `url` query parameter. |
| Video embed shows but never plays | Check your own browser console for errors first — this is more likely a client-side issue than something on the DAM side; report it to SAMS maintainers with the console output if it persists. |
| Embed renders but never resizes / stays a fixed tiny height | `player.js` isn't included on the page, or the `data-sams-embed` attribute is missing from the `<iframe>`. |
| Playlist embed plays one video and stops | Expected if that was the last item. Otherwise report it — auto-advance is supposed to continue through every item in order. |

## Reference

- Embed page: `https://media.ab.dk/embed/{token}` (asset, collection, or playlist — same URL shape for all three)
- oEmbed endpoint: `https://media.ab.dk/api/oembed?url={share-url}` (asset/collection only — see "Playlists have no oEmbed path" above)
- Widget script: `https://media.ab.dk/embed/player.js`
- Share link shapes this all starts from: `https://media.ab.dk/s/{token}` (collection), `https://media.ab.dk/s/{token}/{assetId}` (single asset) — a playlist has no equivalent; its embed token only ever comes from the DAM's own Playlists UI

Source implementation (for anyone touching the DAM side of this): `AB-Copenhagen/SAMS`,
`app/embed/`, `app/api/embed/`, `app/api/oembed/`, `public/embed/player.js`,
`lib/collections.ts`'s `EmbedToken`-related functions, and (playlists specifically)
`lib/playlists.ts`, `app/playlists/`, `app/api/playlists/`.
