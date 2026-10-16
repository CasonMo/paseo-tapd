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

## Release checklist

- `npm run typecheck` and `npm run lint` pass.
- Grep the change for secrets and real identifiers; confirm none.
- Update `OVERVIEW.md` when capabilities or data flows changed.
- Ship a refreshed desensitized screenshot for visual changes.
- Registry records pin the exact commit under review; hand-edited record updates are allowed
  for this repository.
