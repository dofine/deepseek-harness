# dsh-transcript-toggle

Fork-local display controls for the Web chat. Not part of the released product: the package is
`private: true`, has no dependencies and no build step, and is installed by linking it into a profile.

## What it adds

| Control | Where | Effect |
| --- | --- | --- |
| `展开工具与思考` / `收起工具与思考` | Session header | Writes the Chat target's own `ui-chat.transcriptView` preference: `compact` folds every covered closed Turn's tool calls, thinking, and intermediate replies behind its summary row; `normal` leaves them visible. Same setting as **Settings → General → Conversation display**. |
| `显示设置` menu | Session header | Two browser-local switches kept in `localStorage`: **隐藏工具活动** hides tool rows, **隐藏思考块** hides thinking rows. Both apply to a running Turn as well as a settled one, matching the `hideToolActivity` / `hideThinkingBlock` behavior another agent TUI offers. |
| Activity line | Composer dock | While a Turn runs: the tool call executing now, its elapsed seconds, and how many tool calls the Turn has made. It reads the transcript's own row attributes, so it refreshes in place and disappears when the Turn settles. |

The plugin owns no Chat internals. The fold switch drives a public settings scope; hiding is a
stylesheet over rows the Chat target already renders; the activity line reads published row
attributes. Bundle format is the hand-written closure factory every client row registers
(`window.__ModuleLoader__.load({ id, factory })`), so `client.js` ships as-is — no build, no
dependencies, nothing to install.

## Install in a profile

```sh
dsh plugin --profile web add "$PWD/plugins/dsh-transcript-toggle"
```

The package declares `dsh.bundle.patch`, so the profile selects it as a bundle layer automatically and
the Plugins sidebar can switch it off again. When pnpm cannot run in a profile (a `link:` dependency
outside the process's readable paths, for example), link it by hand instead: symlink this directory
into the profile's `node_modules`, add a `link:` dependency to the profile `package.json`, and list
`dsh-transcript-toggle` under `dsh.profile.bundles`.

After installing, restart `dsh web` (or toggle the row in the Plugins sidebar) so the browser roster
recomputes.

## Known limits

- The hiding switches are per browser (`localStorage`), not per profile; the fold switch is the Chat
  target's persisted preference and applies to every Session.
- Hiding is CSS over published rows: hidden rows stay mounted, and browser find cannot reach them.
- Manual expansions are remembered for the page lifetime, so a group opened by hand stays open after
  the fold switch folds everything else. A Turn cut by the loaded window head has no summary row and
  stays expanded until **Load earlier** supplies its own `turn/start`; both behaviors belong to the
  Chat target, not to this plugin.
- The activity line reads the transcript's row attributes (`data-chat-flow-kind`, `data-chat-turn`,
  `data-state`, `data-tool`). A Chat target that renames them stops the line without breaking the page.
