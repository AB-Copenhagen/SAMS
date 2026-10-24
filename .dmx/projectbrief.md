# Project Brief

## Name

SAMS — Sports Asset Management System (repo: `media-ab-dam`, GitHub `AB-Copenhagen/SAMS`).

## What it is

A platform built for professional soccer teams (AB Copenhagen), combining two major products in one Next.js app:

1. **Digital Asset Manager (DAM)** — club photography and video, organised by season, game, and event, with AI-assisted tagging (player face ID, jersey/sponsor OCR), a fast star-rating review workflow, a non-destructive photo editor, and bulk/automated ingest (browser, mobile capture, and a standalone CLI tool for DSLR/HDD workflows).
2. **Customer CRM** — a unified fan record that joins identity (Descope), CDP segments (Goliath), ecommerce spend (Shopify), email engagement (MailerLite), and ticketing/match-attendance (Vivenu/EventBilletten) around one stable key: the fan's Descope `userId` from the separate consumer-facing "MyAB" mobile app project.

## Primary goals

- Give club staff one place to upload, tag, rate, edit, and find media for games, events, and seasons — fast enough to use one-handed on a phone under time pressure (sideline/press-box use case).
- Give club staff one place to see a fan's full cross-platform record — consent, spend, tickets, segments, engagement — without logging into five separate vendor dashboards.
- Automate what can be automated (AI tagging, lazy enrichment, webhook-driven match attendance) so staff time goes to judgment calls, not data entry.

## Scope

**In scope (this codebase):**
- Next.js App Router app (`app/`), API routes, and background jobs (cron + QStash) for both the DAM and the CRM.
- Direct-to-Wasabi (S3-compatible) presigned upload/download flows; AWS Rekognition integration for face/jersey/sponsor detection.
- Sync pipelines pulling from Descope, Goliath, Shopify, MailerLite, and Vivenu into a local Turso (libSQL) database via Prisma.
- `tools/sams-ingest` — a standalone Node CLI for bulk/unattended ingest, versioned in this repo but run outside the deployed app.
- Admin-only screens: Configure (seasons/players/sponsors/stadiums/devices), Analytics, Jobs, the Customer CRM pages.

**Out of scope:**
- The separate "MyAB" consumer mobile app itself (only its Descope project and custom attributes are consulted here).
- A general-purpose reporting/query-builder engine for the CRM — deliberately deferred in favor of four fixed reports (`/customers/reports`); see `.dmx/productContext.md`.
- `prisma migrate` — schema changes ship as one-shot scripts/admin routes against Turso directly (`scripts/push-turso.mjs`), not versioned Prisma migrations.
