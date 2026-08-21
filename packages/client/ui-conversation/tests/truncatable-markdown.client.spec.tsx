// @vitest-environment jsdom
// TruncatableMarkdownText: preview bound behavior — under-cap passthrough,
// over-cap preview + expand/collapse, streaming never truncated, cap 0 disables.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { TruncatableMarkdownText } from '../src/client/chat/TruncatableMarkdownText.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)
const longText = Array.from({ length: 200 }, (_, index) => `line ${index}`).join('\n')

function renderText(over: Partial<Parameters<typeof TruncatableMarkdownText>[0]> = {}) {
  return render(
    <TruncatableMarkdownText
      text={longText}
      streaming={false}
      truncateAfterChars={50}
      codeLabels={undefined}
      fileMentions={undefined}
      t={t}
      {...over}
    />,
  )
}

describe('TruncatableMarkdownText', () => {
  it('passes short text through with no toggle', () => {
    renderText({ text: 'hello **world**', truncateAfterChars: 100 })
    // Markdown rendered (bold survives), no truncation chrome.
    expect(document.querySelector('strong')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('[data-truncated-message]')).toBeNull()
  })

  it('renders a line-boundary preview and an expand toggle when over the bound', () => {
    renderText()
    expect(screen.getByRole('button', { name: /展开全部/ })).not.toBeNull()
    // The preview stops well before the tail, which must not be in the DOM.
    expect(screen.queryByText(/line 199/)).toBeNull()
    expect(document.querySelector('[data-truncated-message]')).not.toBeNull()
  })

  it('expands to the full source and collapses back on toggle', () => {
    renderText()
    fireEvent.click(screen.getByRole('button', { name: /展开全部/ }))
    expect(screen.getByText(/line 199/)).not.toBeNull()
    expect(screen.getByRole('button', { name: /折叠/ })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /折叠/ }))
    expect(screen.queryByText(/line 199/)).toBeNull()
    expect(screen.getByRole('button', { name: /展开全部/ })).not.toBeNull()
  })

  it('never truncates a streaming message', () => {
    renderText({ streaming: true })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/line 199/)).not.toBeNull()
    expect(document.querySelector('[data-truncated-message]')).toBeNull()
  })

  it('treats a zero bound as never truncate', () => {
    renderText({ truncateAfterChars: 0 })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/line 199/)).not.toBeNull()
  })
})
