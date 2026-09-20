# Agent Note: Turn-process folding follows loaded window coverage

Status: implemented

English | [中文](2026-09-21-turn-process-window-coverage.zh.md)

## Problem

Folding a completed Turn's process rows needs three facts about that Turn: where its process range starts, where the final answer begins, and how many Tool calls, replies, and delegations the summary reports. The Chat projector derives all three from the loaded event window, so the shipped rule refused to fold any Turn while the window stayed partial: the oldest loaded Turn can be cut by the window head, and its range and counts would then be wrong. The Session-level `hasMore` flag was the only completeness signal at hand, so it gated every Turn instead of the one that was actually truncated, and each Load earlier pull reloaded older Turns without making the visible ones foldable.

Sessions page 50 user or assistant messages at a time, so a long, tool-heavy Turn occupies most of one page. A 61-turn Session whose average Turn spans a page reached the reader with no folding at all — the whole transcript, process rows included, until every page had been loaded by hand. The original decision and the cost it accepted are [the Web Turn-process folding note](../../archived/feature/2026-08-14-web-turn-process-folding.md).

## Decision

`ChatTurnProcessPresentation` carries `turnStartLoaded`, which `ChatTurnProcessProjector` derives from the Turn Location's recorded `turn/start` event. The loaded window is a contiguous suffix of the Session log, so a loaded `turn/start` proves every event of that Turn is loaded; a Turn without one was cut by the window head, and only that Turn's folding stays withheld. `ChatNodeSeat` folds a closed Turn when `turnStartLoaded` is true, and otherwise only when the whole history is loaded, which preserves the previous fallback for a log that records no `turn/start` at all.

The window head Turn keeps the original guarantee: it never folds until Load earlier supplies its start event, so a fold can never hide process rows the reader has no way to load. Process range, answer boundary, and the summary counts remain the projector's and `TurnProcessSpec`'s facts; this change moves only which Turns are eligible.

Each page load can therefore collapse the Turn it completes, once per load rather than once per Session. Stable Seats, the focus guard, and the manual-expansion store behave as before, so a reader can reopen the group they were reading and the choice survives view remounts for the page lifetime.

## Alternatives considered

**Keep the Session-level `hasMore` gate.** Rejected: it withholds folding from Turns the window already covers in full, and the cost grows with Session length — exactly where folding matters most.

**Load the whole history before folding.** Rejected: it reaches the same end state as manual paging while pulling and replaying every event of a long Session into the browser when the Session opens.

**Compute completeness in the Seat from `routedNode.location`.** Rejected: the projector already owns cross-Node Turn facts and republishes them to every Seat in an affected Turn, so the Seat would duplicate a rule that must stay identical for all of the Turn's rows.

**Relax the gate from a client plugin.** Rejected: the decision and the member-hiding step live inside the Chat target's own Seat, and client extension points only add slots, services, and Node kinds, so a plugin could only replace the whole conversation view or hide rows it does not own.

**Fold only Turns that were already complete before the current page load.** Rejected: it needs transient "just completed" bookkeeping and delays folding for a Turn by exactly the page that proves it complete — the Turn the reader is looking at.

## Consequences

A long Session folds every closed Turn the window covers as soon as it opens, and each Load earlier folds the Turns it completes; only the window head Turn waits, and that Turn is usually running or aborted anyway. Summary counts stay exact, because a folded Turn is by construction fully loaded.

The price is reflow during paging: a page load can collapse the group the reader is anchored to, where the previous rule deferred all folding to the single moment history completed. Scroll anchoring and the focus guard are unchanged, and manual expansion keeps a reopened group open.

## Testing

`chat-view.client.spec.tsx` pins the four Seat cases: a Turn cut by the window head staying expanded while older history remains, a covered closed Turn folding immediately, the completion fallback for a Turn with no recorded `turn/start`, and a loaded page supplying a start that folds its Turn — including its manual expansion afterwards. `conversation-node-definitions.client.spec.ts` pins the projection refresh that makes the fourth case visible without a reload: prepending the page that records the Turn's start flips `turnStartLoaded` on the retained process source. The browser paging scenario in `chat-scroll-contract.e2e.ts` asserts folded controls while Load earlier is still present.
