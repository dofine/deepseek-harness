/**
 * Assistant-message truncation policy. Owns the live preview bound and adopts
 * the durable conversation setting, so a changed bound reaches renders without
 * restarting the page; compositions without a settings provider stay at the
 * default.
 */
import {
  createSnapshotStore, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_TRUNCATE_MESSAGE_CHARS } from '../../submission-settings.ts'
import type { ConversationSettings } from '../../submission-settings.ts'

/**
 * Preview bound for oversized assistant text, seeded from the durable
 * conversation setting.
 */
export class MessageTruncationPolicy {
  /** Reactive preview bound in characters (0 = never truncate). */
  readonly truncateMessageChars: SnapshotStore<number> = createSnapshotStore(DEFAULT_TRUNCATE_MESSAGE_CHARS)

  /**
   * @param host - durable preference scope owned by the providing plugin;
   * absent compositions stay at the default. The adoption subscription shares
   * the scope's plugin lifetime — a disposed scope never publishes again, so
   * the policy needs no release hook.
   */
  constructor(host?: SettingsScope<ConversationSettings>) {
    if (host !== undefined) {
      host.subscribe(() => { this.adopt(host) })
      this.adopt(host)
    }
  }

  /** Adopt the scope's accepted durable bound without writing it back. */
  private adopt(host: SettingsScope<ConversationSettings>): void {
    const section = host.getSnapshot().value
    if (section === undefined || this.truncateMessageChars.getSnapshot() === section.truncateMessageChars) return
    this.truncateMessageChars.set(section.truncateMessageChars)
  }
}
