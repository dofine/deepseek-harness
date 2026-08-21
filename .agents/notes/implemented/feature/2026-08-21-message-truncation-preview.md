# Agent Note: Assistant-message truncation preview

Status: implemented

English | [中文](2026-08-21-message-truncation-preview.zh.md)

## Problem

The chat view renders every assistant `text` block through `MarkdownText`, which on a settled message runs one full `parseGfmWithMath` pass plus syntax highlighting over the whole source. A pathological message — 290k characters, 42 code blocks, one 866k-character JSON line ([discussion #359](https://github.com/deepseek-ai/deepseek-harness/discussions/359)) — makes that one pass dominate the main thread and contributes to the long-session tab freeze. History pruning cuts the payload; this fixes the remaining single-message render cost.

## Decision

Settled assistant `text` blocks longer than a configurable bound render as a **line-bounded preview** plus an expand toggle; expanding runs the full `MarkdownText` pass on the reader's explicit gesture. Streaming text is never truncated — the incremental parser already bounds per-chunk work, and a preview would fight the freeze/accumulate logic.

- The bound is the Host-backed `ui-conversation.truncateMessageChars` General Settings preference (default 50000, 0 disables), stored in `$DSH_HOME/settings.yaml` like `busyEnter` and adopted live by `MessageTruncationPolicy`; a changed bound reaches renders without restarting the page.
- The value flows to the assistant renderer through the chat-node inject face (`ChatNodeTurnDataInjected.hooks.truncateMessageChars`, an `HostObservable` → `useTruncateMessageChars`), so business components stay pure props over the standard kit.
- The preview cuts at the last line break at or before the bound (at least half the bound), keeping block structures whole; it drops file mentions because their targets may live past the cut. The full source and the session log are untouched, so expanding always restores the complete message.
- The preview and toggle live in one component (`TruncatableMarkdownText`) with expand/collapse as local state; the expanded render is a plain props swap, and re-rendering the same bound/message keeps the reader's choice.

## Consequences

- A settled assistant `text` block over the bound renders a line-bounded preview plus an expand toggle instead of one full markdown/highlight pass; the reader's expand restores the complete message and its file mentions. The session log and full source are untouched, so fidelity and durable export are unchanged.
- The default bound (50000) is high enough that ordinary messages render exactly as before; only pathological messages truncate. Users can raise it or set 0 to disable via the General Settings document; a changed bound reaches renders live.
- Streaming and interrupted messages are unaffected (streaming is never truncated; interrupted partials below the bound render as before).
- Any new consumer of the chat-node inject face must provide the `truncateMessageChars` hook source (or a stub in hand-rendered tests); the assistant renderer is the only current consumer.

## Alternatives considered

**Truncate the assistant node data (cap blocks server/client-side).** Rejected: the full message content must remain available for expand, and the conversation window already holds it — truncating data would force a refetch or a second surface for the full source.

**Truncate inside `MarkdownText` (ui-primitives).** Rejected: the bound is a conversation product preference, and a shared primitive should not take a product config; the wrapper keeps ui-primitives stable and the toggle beside the renderer.

**Hardcode a `DEFAULT_*` constant only.** Rejected: "No hardcoded tunables in plugins" — the setting is a validated, changeable preference (a constant is just its default).

**Count code fences too.** Deferred: the measured pathological case is char-dominated (290k chars); a "many small blocks under the char bound" case is possible but rarer, and a fence-count cap is a follow-up refinement rather than a second axis now.
