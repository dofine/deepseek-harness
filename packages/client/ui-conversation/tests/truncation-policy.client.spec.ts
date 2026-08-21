// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { MessageTruncationPolicy } from '../src/client/chat/truncation-policy.ts'
import { DEFAULT_TRUNCATE_MESSAGE_CHARS } from '../src/submission-settings.ts'
import type { ConversationSettings } from '../src/submission-settings.ts'

const fullSection = (truncateMessageChars: number): ConversationSettings => ({
  busyEnter: 'queue',
  truncateMessageChars,
})

describe('MessageTruncationPolicy', () => {
  it('defaults to the standard preview bound without a scope', () => {
    const policy = new MessageTruncationPolicy()
    expect(policy.truncateMessageChars.getSnapshot()).toBe(DEFAULT_TRUNCATE_MESSAGE_CHARS)
  })

  it('adopts a Host bound without writing it back', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const policy = new MessageTruncationPolicy(host.scope)
    host.publish({ status: 'ready', value: fullSection(0), revision: 1, writable: true })
    expect(policy.truncateMessageChars.getSnapshot()).toBe(0)
    expect(host.set).not.toHaveBeenCalled()
    host.publish({ value: fullSection(10_000), revision: 2 })
    expect(policy.truncateMessageChars.getSnapshot()).toBe(10_000)
  })

  it('adopts a bound already standing at construction', () => {
    const host = stubSettingsScope<ConversationSettings>()
    host.publish({ status: 'ready', value: fullSection(0), revision: 1, writable: true })
    const policy = new MessageTruncationPolicy(host.scope)
    expect(policy.truncateMessageChars.getSnapshot()).toBe(0)
  })
})
