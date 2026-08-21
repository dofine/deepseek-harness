/**
 * session.history presentation-page reduction: for a step whose completed
 * append-surface assistant/message is in the page, its assistant/chunk events
 * collapse to the first token delta (step timing must survive a fresh window
 * load); steps with no in-page completed message keep every chunk; and
 * sourceEventSeqs is stripped from every shipped event.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { Session } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { createAssistantMessage, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`history-reduce-${String(nextRpc++)}`), payload }
}

async function harness(): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  return { ctx, session: ctx.sessions.create() }
}

const api = (ctx: Context) => createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })

const STEP_CHUNKS: readonly StreamChunk[] = [
  { type: 'reasoning-delta', index: 0, text: 'let me reason' },
  { type: 'text-delta', index: 0, text: 'Hello ' },
  { type: 'text-delta', index: 0, text: 'world' },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
]

/** Append one completed assistant step: its chunks then the final message. */
function appendCompletedStep(session: Session, turn: number, step: number): void {
  const chunkSeqs = STEP_CHUNKS.map(chunk =>
    session.append('assistant/chunk', { turn, step, chunk }).seq)
  session.append('assistant/message', {
    turn,
    step,
    message: createAssistantMessage({
      content: [
        { type: 'text', text: 'Hello world' },
        { type: 'reasoning', text: 'let me reason' },
      ],
      source: { provider: 'p', model: 'm' },
    }),
    usage: { inputTokens: 10, outputTokens: 5 },
  }, { surfaceOp: 'append', sourceEventSeqs: chunkSeqs })
}

function appendCompletedTurn(session: Session, turn: number): void {
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  appendCompletedStep(session, turn, 1)
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

/** Wire history entries carry `data` as unknown; narrow each accessed shape explicitly. */
const chunkData = (event: SessionEvent): SessionEvent<'assistant/chunk'>['data'] =>
  event.data as SessionEvent<'assistant/chunk'>['data']
const messageData = (event: SessionEvent): SessionEvent<'assistant/message'>['data'] =>
  event.data as SessionEvent<'assistant/message'>['data']

describe('session.history presentation reduction', () => {
  it('collapses completed-step chunks to the first token delta and keeps interrupted chunks', async () => {
    const { ctx, session } = await harness()
    const turn = 1
    session.append('turn/start', { turn })
    session.append('step/start', { turn, step: 1 })
    appendCompletedStep(session, turn, 1)
    session.append('step/end', { turn, step: 1 })
    // Interrupted step: chunks streamed but no completed message ever landed.
    session.append('step/start', { turn, step: 2 })
    session.append('assistant/chunk', { turn, step: 2, chunk: { type: 'text-delta', index: 0, text: 'partial' } })
    session.append('assistant/chunk', { turn, step: 2, chunk: { type: 'text-delta', index: 0, text: 'output' } })
    session.append('step/end', { turn, step: 2 })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })

    const response = await api(ctx).sessions.history(request({ sessionId: session.id }))
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) throw new Error('unreachable')
    const { events } = response.result.value

    // Completed step 1 keeps exactly its first token-delta chunk.
    const step1Chunks = events
      .filter(entry => entry.event.type === 'assistant/chunk'
        && chunkData(entry.event).turn === 1 && chunkData(entry.event).step === 1)
      .map(entry => chunkData(entry.event).chunk)
    expect(step1Chunks).toEqual([{ type: 'reasoning-delta', index: 0, text: 'let me reason' }])

    // Interrupted step 2 keeps every chunk.
    const step2Chunks = events
      .filter(entry => entry.event.type === 'assistant/chunk'
        && chunkData(entry.event).turn === 1 && chunkData(entry.event).step === 2)
    expect(step2Chunks).toHaveLength(2)

    // The completed message survives with its final content.
    expect(events.filter(entry => entry.event.type === 'assistant/message')).toHaveLength(1)

    // No shipped event carries sourceEventSeqs.
    for (const entry of events) expect('sourceEventSeqs' in entry.event).toBe(false)

    // Order stays ascending.
    const seqs = events.map(entry => entry.event.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })

  it('reduces whichever message group a page cut selects', async () => {
    const { ctx, session } = await harness()
    appendCompletedTurn(session, 1)
    appendCompletedTurn(session, 2)

    // maxMessages 1 cuts the tail page to turn 2's group (chunks included).
    const response = await api(ctx).sessions.history(request({ sessionId: session.id, maxMessages: 1 }))
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) throw new Error('unreachable')
    const { events, hasMore } = response.result.value

    expect(hasMore).toBe(true)
    expect(events
      .filter(entry => entry.event.type === 'assistant/message')
      .map(entry => messageData(entry.event).turn)).toEqual([2])
    // Only turn 2's first token-delta chunk ships.
    expect(events
      .filter(entry => entry.event.type === 'assistant/chunk')
      .map(entry => chunkData(entry.event).chunk))
      .toEqual([{ type: 'reasoning-delta', index: 0, text: 'let me reason' }])
    for (const entry of events) expect('sourceEventSeqs' in entry.event).toBe(false)
  })
})
