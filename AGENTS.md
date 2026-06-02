<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Folder map

- `app/` — App Router source dir (route handlers, `page.tsx`, `layout.tsx`, `loading.tsx`, `api/`)
- `components/` — React components (mix of Server + Client; check for `'use client'` directive)
- `lib/` — Shared helpers, types, hooks, Supabase client factories, prompts
- `infra/` — Off-repo DB schema snapshot + local-setup README (NOT committed to git; on-disk reference only)

**Triply-deep `app/app/app/` path quirk is CORRECT, not a misconfiguration.** Next.js project root is `creator-ops/app/` (where `package.json` lives); App Router source dir is also called `app/`; the URL segment `/app/*` lives at `app/app/app/...`. Verify paths firsthand before trusting any subagent finding about routing or layout structure — past Explore subagents have stumbled here.

## Engineering canon — read before writing non-trivial code

→ `../docs/engineering/learnings.md` — backend / data / API / DB / infra patterns + anti-patterns + verification discipline + dev/deploy commands

→ `../docs/engineering/ui-components.md` — component inventory + duplication-risk flags (canonical pick per pattern family — e.g., new modals use `.modal-*` family, NOT `.add-modal-*` or `.pitch-modal-*`) + per-component detail
