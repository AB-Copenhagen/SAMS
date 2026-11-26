---
ticket: gh-128
branch: feature-gh-128-support-playlists-curated-ordered-media
summary: Support Playlists: curated, ordered media sets for playlist embeds/links
ticketing: github-issues
---

# Support Playlists: curated, ordered media sets for playlist embeds/links

**Ticket:** [#128](https://github.com/AB-Copenhagen/SAMS/issues/128)
**Type:** feature
**Branch:** feature-gh-128-support-playlists-curated-ordered-media

---

## Context

Follow-up to gh-123 (embeddable videos/galleries). Collection embeds already render a thumbnail grid (`EmbedGallery`) of a collection's assets, but that's browse-and-expand, not a sequential auto-advancing player. A dedicated Playlist concept lets staff curate and manually order a set of media specifically for playback as a playlist, independent of however that same media may already be organized into Collections for other purposes.

## Scope

- A `Playlist` entity: name, ordered list of media items (assets), created/managed by staff
- UI to create a playlist, add/remove media, and reorder items
- Playlist embed: a chromeless embed page that plays items in order (auto-advance), reusing gh-123's embed-token/CSP/proxy infrastructure where possible
- Playlist share link and/or embed code generation, following the same self-serve, permanent-until-revoked model as gh-123's embed tokens

## Out of Scope

- Non-video (image) assets as playlist items — playlists are video-only
- Seeding/creating a playlist from an existing Collection's members — playlists are populated directly (search-and-add from the asset side, or add-to-playlist from a playlist's own management screen), with no Collection coupling at launch
- Any admin-only or special permission gate for playlist management — it is self-serve, same as gh-123's embed tokens

## Technical Approach

- New `Playlist` Prisma model (name, `createdBy`, timestamps) plus a `PlaylistItem` join model (`playlistId`, `assetId`, an explicit `position`/order column, `addedAt`) — an ordered many-to-many between `Playlist` and `Asset`, added via the existing one-shot-admin-route schema convention, not `prisma migrate`
- Adding an item validates the target asset is a video (reject non-video assets at the API layer; no DB-level type constraint needed)
- `EmbedToken.targetType` gains a third value, `'playlist'`, reusing the existing issuance (`generateEmbedToken`/`getOrCreateEmbedToken`), revocation (`revokeEmbedToken`), and CSP/proxy infrastructure from gh-123 rather than a parallel token system
- `/embed/[token]` gains a playlist-target branch: resolves the ordered `PlaylistItem` list (video assets only, already enforced at insert time) and renders a sequential, auto-advancing video player (reusing `VideoPlayer`/`EmbedBridge`'s existing play/pause bridge, extended for advancing to the next item)
- New top-level "Playlists" admin nav item (its own list + detail page), not nested under Collections — detail page supports adding assets (search), removing, and reordering, plus the same self-serve `EmbedPanel`-style generate/copy/revoke embed-link card gated by `hasPermission(user, 'media', 'edit')`, matching gh-123's self-serve model exactly (no separate admin gate)

---

## Questions
<!-- Answer each question below before running /dmx/plan. -->

1. Can a playlist contain non-video (image) assets, and if so how do they behave during playback (timed display before auto-advancing, or excluded from playback order entirely)?
   Answer: no, these are video playlists only

2. Should `EmbedToken` grow a new `'playlist'` `targetType` (reusing the existing issuance/revocation/resolution machinery from gh-123), or does Playlist need its own, separate token/grant concept?
   Answer: I think EmbedToken should expand to have playlist type

3. Is there any relation to existing Collections at launch (e.g. a "create playlist from this collection" convenience that seeds the ordered list from a collection's current members), or is Playlist fully independent of Collection from day one?
   Answer:  No need, we should be able to add directly from a playlist or find the media asset and add to a playlist (for video assets)

4. Where does playlist management live in the admin UI — a new top-level nav item, or nested under the existing Collections section?
   Answer: Top Level

5. Is playlist creation/management self-serve for any staff member with media-edit access (matching gh-123's embed-token model), or does it need its own permission gate?
   Answer: any staff member can self-serve playlist creation/management
