# Harness Web Customization — Research (read-only)

Date: 2026-10-10. Scope: preserve the real Harness chat homepage, add a sidebar
visual Skill library + task scenarios inside the real Harness web UI; `Use` binds
a skill to the current chat (affects subsequent messages, removable chip).
No source modified. No app/engine changed.

## 1. Pinned package map (exact paths)

Root: `work/agent-bundle-e2e-qJTB72/agent/node_modules/@deepseek-ai/dsh/`

- Engine (host) plugins: `dsh/node_modules/@deepseek-ai/dsh-tool-skill`,
  `dsh-skill`, `dsh-skill-filesystem`, `dsh-system-prompt`, `dsh-web-frontend`.
- Web bundle: `dsh/node_modules/@deepseek-ai/dsh-web-app` (has
  `cordis.patch.yml`, the plugin composition file).
- Browser (client) plugins: `dsh-web-app/node_modules/@deepseek-ai/dsh-client-ui-*`
  (`skill`, `sidebar`, `sidebar-right`, `conversation`, `input-trigger`, `layout`,
  `renderer`, `chat`, `settings`, ...).
- `dsh-client-ui-slots` and `dsh-client-store` are **not extracted** — they are
  types-only deps bundled into the web dist (`dsh-web-frontend/dist/assets`, minified).

## 2. Existing skill picker + invocation (confirmed end-to-end)

Browser half — `dsh-client-ui-skill/lib/client.js`:
- `apply(ctx)` at :226 registers locale, the `tool.call.toolview` row (:231),
  and the `/` input source.
- `const skills = ctx.remote.skills` (:236); candidates come from
  `skills.list({sessionId})` (:245, error-wrapped :254), cached per session.
- Source object ~:281: `{trigger:'/', name:'skill', order:2, candidates, warm,
  lexicon, subscribeLexicon, onPick}`.
- `onPick` (~:306) returns `{ text: '/<name> ' }` — **a pick inserts literal
  `/name ` text into the draft. There is no persistent per-session binding.**
- Register/unregister via `ctx.get('inputTriggers').registerSource(source)`
  (:313, :317).

Host half — `dsh-tool-skill/lib/index.js`:
- `ctx.on('agent/pre-step', ...)` at :168. `invokedSkillNames(messages)` (:171,
  defined :381) scans **direct user messages** (`source.kind==='user'`) with
  `SKILL_GESTURE` (:375) = `/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g`.
- For each name: `ctx.skills.get(name, lookup)`, require `isUserInvocable`,
  build `{kind:'skill-invocation', name, form:'instructions'}`, append a
  `createUserMessage` containing `renderSkillContent(skill)` (:181-198).
- Second `agent/pre-step` (:203) publishes the model-facing `<available_skills>`
  catalog (dedup by sha256 digest).
- `dsh-skill/lib/types/index.d.ts` owns `SkillInvocationPolicy{modelInvocable,
  userInvocable}`, `renderSkillContent`, `SkillInvocationSource`.

**Consequence:** the current model is *per-message gesture*, re-fired only when the
outgoing user text contains `/name`. A "bound skill" that affects every subsequent
turn is **not supported today**.

## 3. UI slot extension points (`dsh-client-ui-slots`, SlotMap)

Composer / chat (session scope) — `dsh-client-ui-conversation/.../contract/slots.d.ts`:
`conversation.input.dock` (list, full-width above composer — chip rail candidate),
`conversation.input.overlay` (list), `conversation.composer.dock` (list),
`conversation.input.attachments` (single, session-maybe),
`conversation.input.left` / `.right` (list), `conversation.session.header.actions`
/ `.utilities` (list).

Sidebar / panels — `dsh-client-ui-sidebar/.../contract/slots.d.ts` and
`dsh-client-ui-layout/.../index.d.ts`:
`sidebar.panellist` (list of global panel icons → main panels),
`sidebar.workspaces`, `sidebar.settings`, `sidebar.footer.action`,
`main` (keyed, root — "reserved `conversation` key hosts the Conversation; other
keys receive no Session binding"), `shell.overlay` (list, additive).

Registration API: `ctx.slots.register(...)` / `ctx.slots.inject(key, cb)`
(`dsh-client-ui-renderer/.../registry.d.ts`: `SlotRegistry.register`,
`inject`, `entriesOfSlot`). Panel nav via `ctx.layout.selectPanel(MainPanelId|null)`
(`dsh-client-ui-layout/.../service.d.ts`).

## 4. Package loading / composition

Client plugins declare `package.json` → `dsh.client.inject[]` + `platform:"web"`
(see `dsh-client-ui-skill/package.json`), and are composed as rows in
`dsh-web-app/cordis.patch.yml` (`- id: ui-skill / name: '@deepseek-ai/dsh-client-ui-skill'`,
`:220+`). `dsh-web-app/lib/index.js:176` mounts the dist; client bundles load
through `window.__ModuleLoader__.load({id, factory})` (see top of any `lib/client.js`),
discovery via `dsh-client-modules` `createClientModuleSystem`.

## 5. Options

**A. Plugin extension (recommended).** New client package with
`dsh.client.platform:"web"`, one row added to `cordis.patch.yml`:
register a `main` keyed entry + `sidebar.panellist` row = the Skill-library panel;
register `conversation.input.dock` = the removable chip. Zero fork of shipped
packages; survives upgrades if slot keys are stable.

**B. Minimal fork.** Fork `dsh-client-ui-skill` (or `dsh-tool-skill`) to add a
bound-skill store and a dedicated `agent/pre-step` injection. Only justified if
`Use` must inject without polluting the user's message text (Option A's shortest
path auto-inserts `/name ` per message; the transcript already decorates that
token as a chip via the shared `SKILL_GESTURE` shape).

**Shortest working path for the binding requirement:** client chip auto-prepends
`/name ` to each outgoing message for the session → existing host `agent/pre-step`
injects unchanged. No host edit.

## 6. Version risks (exact evidence)

- Inspected bundle packages are all `0.1.5-rc.3`; `engine/agent.js:30` pins
  `AGENT_VERSION='0.1.5-rc.2'` — **installer/bundle version mismatch to reconcile.**
- `engine/agent.js:32` pins `@deepseek-ai/cordis@4.0.2` with a documented crash:
  floating deps pull cordis 4.0.3 → "user patch-layer watching requires the
  Cordis HMR service" at startup. Also pins `cordis-plugin-hmr@1.0.17`,
  `dsh-win32-process@0.1.5-rc.3`.
- rc-series internals (slot keys, `agent/pre-step`, `inputTriggers.registerSource`,
  `skills/list`) are undocumented and may change per rc — any plugin is
  version-locked and must be re-verified on upgrade.

## 7. Integration tests (mock model, no real spending)

Existing style: assert-based self-checks, no framework (`tests/skills.js`,
`engine/*.js` build self-check blocks). The injection seam is pure:
`agent/pre-step` handler + a fake `messages` array → assert an injected
`skill-invocation` message. No model call. For RPC-level tests, stub
`fetchImpl` (pattern in `envmgr.js`). Do **not** reuse `engine/test.js` (native
fetch to the live endpoint — real tokens).

## 8. Installer Git gap

`engine/envmgr.js:28` probes Git and `plan()` returns `mode:'handoff'` (opens
`git-scm.com`) unless a URL+sha256 is configured; `engine/runtimes.json` has
`git:{url:null,sha256:null}`. `engine/private-env.js` already implements portable
Git/Python staging into the runtime root (`:185`), and `engine/presets.js:34,117`
list Git as a prerequisite. So Git *can* join the one-click install with Node +
Harness, but the registry entry is currently blank (deliberately — hash must be
human-verified). Node/Harness install path: `engine/install.js` (env → key →
pinned `npm install`), `engine/runtime.js` puts `managed.git` on PATH.

## 9. Unanswered interaction questions

1. `Use` semantics: bind to the *current session only* (drop on new session), or
   persist as a default? Multiple bound skills simultaneously?
2. Chip location/behavior: `conversation.input.dock` (above composer) vs
   `conversation.input.attachments` rail; remove via chip "×" only, or also a
   picker toggle?
3. Injection shape: acceptable to reuse the `/name` gesture (token visible in the
   sent text, already chip-decorated) — or is a silent `instructions` context
   injection (fork/host plugin) required?
4. If silent injection: is a new host plugin + remote controller + client
   persistence in scope, and where is the binding persisted (in-memory session,
   `~/.dsh`, workspace)?
5. Relationship between the 538-skill library panel and the existing `/` picker:
   duplicate surface, or the panel is the primary browse and `/` stays for power
   users?
6. Task scenarios: same panel as skills (grouped) or a separate `main` key? Source
   of scenario definitions — reuse `engine/presets.js` / `harness.js` scenario
   labels?
7. Which Harness version do we target — align installer to the inspected
   `0.1.5-rc.3` bundle, or keep `0.1.5-rc.2`?
8. Sidebar panel: full-width `main` keyed panel (recommended, no Session binding)
   vs a narrow `sidebar.footer.action`/`workspaces` insert.
