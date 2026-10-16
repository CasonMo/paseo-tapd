# AGENTS.md

Working rules for contributors and coding agents in this repository. They restate the
Paseo plugin requirements we must follow when developing, reviewing, and releasing.

## References

- Plugin quickstart: https://paseo.sh/docs/plugins
- Plugin reference: https://paseo.sh/docs/plugins/reference
- Publishing guide: https://paseo.sh/docs/plugins/publishing
- Registry review policy: https://github.com/getpaseo/plugins/blob/main/REVIEW.md

## Compliance

- Keep the standard plugin layout: `paseo-plugin.json`, `index.client.tsx`,
  `index.server.ts`, `client/`, `server/`, `shared/`, with a committed lockfile.
- Manifest paths are relative, use forward slashes, and must not contain `..` segments.
  Keep `requirements.paseo` accurate and the listed entry files present.
- Follow the plugin SDK contracts: client code must not reach into daemon-only APIs, and
  daemon code must not depend on the UI. Keep RPC contracts schema-validated.
- Dependencies must stay minimal and resolve through the committed lockfile. Any build or
  lifecycle script must have an understandable purpose and no hidden side effects.
- Registry review reads the pinned artifact without executing it; everything needed to
  understand the plugin must be inside the repository.

## Security

- Never print, echo, log, quote, or otherwise output `TAPD_TOKEN` or any other credential —
  not in UI text, agent prompts, tool output, errors, or documentation. Paseo logs are
  readable by connected users. Test presence only, for example `test -n "$TAPD_TOKEN"`.
- Credentials come from plugin settings or daemon environment variables and go only to the
  configured TAPD endpoints (`TAPD_API_ENDPOINT`, default `https://api.tapd.cn`).
- All write operations (comments, status changes, item creation) require an explicit user
  action, and target the first configured TAPD project.
- No hidden network calls, no telemetry, no `eval` of dynamic or remote code, no shell
  built from external data. Document every network destination and data flow in `OVERVIEW.md`.
- The plugin runs trusted and unsandboxed; keep it that way on purpose.

## Data sanitization

- Everything committed must be desensitized: no real names, account handles, workspace or
  item IDs, tokens, cookies, internal hostnames, or customer data in code, comments, docs,
  fixtures, examples, screenshots, or commit messages.
- Use obvious placeholders such as `<workspace-id>`, `<token>`, `example.com`, `12345678`.
- Screenshots and media must be captured against fake data before they are committed.

## Code safety

- Reads by default; mutations hang off a user gesture and a visible confirmation.
- Validate and clamp external input; keep error messages useful without echoing credentials
  or raw request bodies.
- When behavior or data access changes, update `OVERVIEW.md` in the same change.

## Keeping docs in sync

Feature changes must update the user-facing documents in the same change:

- `README.md`: feature list, setup, and usage examples.
- `OVERVIEW.md`: capabilities, settings, permissions, and data access.
- `paseo-plugin.json`: description, media, icon, and requirements.

A release is not ready while these documents still describe older behavior.

## Publishing and releases

The registry at https://github.com/getpaseo/plugins pins one exact commit of this
repository, and that pinned artifact is what users install.

1. Push the finished change to `main` after the checklist below passes.
2. Request the update in the registry: open a submission issue (title = the plugin
   name, Source = this repository) naming the desired commit, or propose the new
   commit directly in the existing record with a hand-edited pull request. Git
   updates are manual; nothing is bumped automatically.
3. The reviewer verifies the pinned commit, runs the trusted registry validation,
   and merges. Approved listings appear on paseo.sh/plugins; no tag is required.
4. After merge, confirm the listing installs the new pin.

Checklist before pushing:

- `npm run typecheck` and `npm run lint` pass.
- Grep the change for secrets and real identifiers; confirm none.
- README, OVERVIEW, and the manifest are updated together (see above).
- Ship a refreshed desensitized screenshot for visual changes.
