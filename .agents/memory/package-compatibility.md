---
name: Package compatibility and release-age constraints
description: Non-obvious dependency constraints encountered while building this workspace.
---

Generated API Zod schemas currently rely on Zod v4 APIs such as `zod.int()` and `zod.url()`, so lowering the workspace Zod catalog back to v3 breaks the library typecheck.

**Why:** Orval's current Zod output is v4-oriented even when older workspace templates are pinned to Zod 3.

**How to apply:** Keep the catalog on Zod v4 before regenerating the OpenAPI client. The workspace also enforces a one-day npm minimum release age, so prefer the newest mature Clerk versions rather than same-day releases.