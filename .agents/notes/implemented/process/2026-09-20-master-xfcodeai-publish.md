# Agent Note: publish @deepseek-ai/dsh from master

Status: implemented

English | [中文](2026-09-20-master-xfcodeai-publish.zh.md)

## Problem

`dev-x1a0f3n9` already publishes `@deepseek-ai/dsh-*`. The stable fork line is supposed to publish `@deepseek-ai/dsh-*` from `master` in the same GitHub repository. Rescoping the git tree to `@xfcodeai` would fight every master↔dev merge, and a blanket `@deepseek-ai/` rewrite would also rename preset plugins that stay on `@x1a0f3n9`.

## Decision

Git keeps `@deepseek-ai/dsh-*`. Pushing `master` packs that tree, rewrites only complete dsh-family package names in the packed tarballs onto `@xfcodeai`, and publishes from environment `npm-publish-xfcodeai`. Preset plugins that are not family members, and vendor `@deepseek-ai` packages, stay unrewritten. `dev-x1a0f3n9` still publishes `@deepseek-ai/*` from environment `npm-publish`.

`pnpm run release:rewrite-scope --family dsh --from dist/npm --out dist/npm-xfcodeai --to-scope @xfcodeai` is the rewrite step. A shorter name such as `@deepseek-ai/dsh` does not rewrite `@deepseek-ai/dsh-session-timeline`.

## Verification

`pnpm exec vitest run scripts/release/rewrite-packed-scope.spec.ts scripts/ci-workflow.spec.ts scripts/release/verify.spec.ts` pins the complete-name rewrite and the `publish-xfcodeai` job.

## Alternatives considered

**Rescope the git tree to `@xfcodeai` on master.** Rejected: every merge between `master` and `dev-x1a0f3n9` would rewrite hundreds of package names.

**Replace every `@deepseek-ai/` string in the tarball.** Rejected: that would publish preset plugins such as `@deepseek-ai/dsh-session-timeline` as `@deepseek-ai/...`.

**Publish `@deepseek-ai/*` from `dev-x1a0f3n9`.** Rejected: the two scopes are two lines. Development stays `@x1a0f3n9`; stable stays `@xfcodeai`.

## Consequences

- `master` is the stable fork line, not a clean upstream mirror. Upstream updates merge into `master`, then into `dev-x1a0f3n9`.
- Friends install the stable CLI with `npm install --global @deepseek-ai/dsh`.
- An npm new-name quota pause on `master` stops remaining `@xfcodeai` names the same way `dev-x1a0f3n9` pauses `@x1a0f3n9`.
