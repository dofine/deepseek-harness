# Agent Note: History presentation reduction for long reasoning sessions

Status: implemented

English | [中文](2026-08-21-history-presentation-reduction.zh.md)

## Problem

`session.history` returns one page per append-origin message group, and the page carries **every raw event the group owns** — including all `assistant/chunk` events. With high reasoning effort, one assistant message can fold tens of thousands of stream chunks, so a single 50-message tail page ballooned to 27k events / 5.1 MB of JSON, ~99% of it `assistant/chunk` ([discussion #2119](https://github.com/deepseek-ai/deepseek-harness/discussions/2119)); one extreme message alone aggregated 97k chunk seqs into its `sourceEventSeqs` (866k characters on one line, [discussion #359](https://github.com/deepseek-ai/deepseek-harness/discussions/359)). The server answers in ~40 ms — the cost is payload size, not server work — but the client installs the whole window and replays every event on the main thread, so opening such a session freezes the tab, and a frozen tab cannot render the `approval/asked` that arrives mid-turn.

## Decision

`historyPage` reduces the page before shipping, in one choke point shared by `session.history` and `subagent.history`:

- For a step whose completed append-surface `assistant/message` is on the page, its `assistant/chunk` events collapse to the **first non-empty token delta** (`isTokenDelta`, the same predicate the client's step timing uses). The message already carries the final blocks and usage, so the content renders identically; the one kept chunk preserves the client's TTFT / decode metrics on a fresh window load (`navigation-panes` and `skill-user-invoke` e2e scenarios pin that timing chrome).
- Steps with no completed message in the page (interrupted steps, the in-progress tail partial) keep **every** chunk: the client reconstructs their content from chunks (`assistantDefinition.fallbackState`, the trajectory interrupted path, the turn-tail interrupted anchor).
- `sourceEventSeqs` is stripped from every shipped event. Only the server's `paginate` grouping reads it; the client never does, and a high-reasoning message's index alone can be ~10^5 numbers.

`paginate` still runs on the unreduced page, so message-boundary grouping, the `hasMore` cut, and the compaction-summary-same-page guarantee are unchanged. The session log, live mux frames, and `session.export` are untouched — this is a presentation reduction of the history RPC only.

## Why in-page completion

`paginate` never cuts mid-message (the cut is the group's earliest chunk seq), so a completed message and all its chunks always land in the same page. The "completed in page" test is therefore exact for completed steps, and the only in-page chunk-without-message cases are genuinely partial or interrupted steps, which is precisely where the client needs the chunks.

## Consequences

- `session.history` and `subagent.history` responses no longer carry every `assistant/chunk` event for completed steps, nor any `sourceEventSeqs`. Completed content and usage render identically — the message event owns them — while TTFT / tokens/sec survive through the one kept delta chunk, and interrupted or in-progress steps keep their chunks.
- The session log, live mux frames, and `session.export` are untouched: the reduction applies to the history RPC only, so replay fidelity and durable export are unchanged.
- A `loadOlder` page cut mid-conversation still reduces each shipped group; the `hasMore` boundary and the compaction-summary-same-page guarantee are unchanged.
- A future consumer that needs the full chunk stream or `sourceEventSeqs` for a history window must opt into a separate surface; the presentation window no longer provides them.

## Alternatives considered

**Client-side capping in `replaceWindow`.** Rejected: the 5 MB still crosses the wire, and capping logic on the client would need to be deterministic and replayable; the server owns the log shape and can drop the bytes at the source.

**Drop all completed-step chunks.** Rejected: the client derives TTFT and tokens/sec from the first token delta, and two browser e2e scenarios assert that timing chrome survives a replay that loads from history. Keeping one delta chunk per completed step preserves the metrics at negligible payload cost.

**Keep `sourceEventSeqs`.** Rejected: it is the other half of the 866k-character message, only `paginate` reads it, and it never crosses the presentation window's needs.
