/**
 * TruncatableMarkdownText: renders assistant text markdown, bounded to a
 * preview when the source exceeds the configured bound. The preview keeps
 * whole lines (a line-boundary cut leaves block structures intact) and drops
 * file mentions (their targets may live past the cut); expanding renders the
 * full source with mentions, on the reader's explicit gesture. Streaming
 * text is never truncated — the incremental parser already bounds per-chunk
 * work, and a preview would fight the freeze/accumulate logic.
 */

import { useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownCodeLabels, MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import css from './TruncatableMarkdownText.module.css'

/**
 * Bound a preview to the last line break at or before the cap, keeping at
 * least half the cap when a single first line spans it.
 * @param text - the full markdown source.
 * @param cap - preview bound in characters.
 * @returns the preview slice.
 */
function previewSlice(text: string, cap: number): string {
  const end = text.lastIndexOf('\n', cap)
  return end >= cap * 0.5 ? text.slice(0, end) : text.slice(0, cap)
}

/** Markdown text with an optional preview bound and expand/collapse toggle. */
export function TruncatableMarkdownText({
  text, streaming, truncateAfterChars, codeLabels, fileMentions, t,
}: {
  text: string
  streaming: boolean
  truncateAfterChars: number
  codeLabels: MarkdownCodeLabels | undefined
  fileMentions: MarkdownFileMentions | undefined
  t: ChatViewSlotProps['t']
}) {
  const [expanded, setExpanded] = useState(false)
  const oversized = !streaming && truncateAfterChars > 0 && text.length > truncateAfterChars
  if (!oversized) {
    return <MarkdownText text={text} streaming={streaming} codeLabels={codeLabels} fileMentions={fileMentions} />
  }
  if (expanded) {
    return (
      <div className={css.root} data-truncated-message="">
        <MarkdownText text={text} streaming={false} codeLabels={codeLabels} fileMentions={fileMentions} />
        <button type="button" className={css.toggle} onClick={() => { setExpanded(false) }}>
          {t('message.truncated.collapse')}
        </button>
      </div>
    )
  }
  return (
    <div className={css.root} data-truncated-message="">
      <MarkdownText text={previewSlice(text, truncateAfterChars)} streaming={false} codeLabels={codeLabels} />
      <button type="button" className={css.toggle} onClick={() => { setExpanded(true) }}>
        {t('message.truncated.expand', { total: text.length })}
      </button>
    </div>
  )
}
