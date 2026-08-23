import { starterKit } from '@matra/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { EditorContent } from './editor-content'
import { useEditor, useEditorState } from './use-editor'

afterEach(cleanup)

function Toolbar() {
  const editor = useEditor({ extensions: starterKit, content: '<p>hello</p>' })
  const isBold = useEditorState(editor, (e) => {
    const html = e.getHTML()
    return html.includes('<strong>')
  })

  return (
    <>
      <button
        type="button"
        aria-pressed={isBold}
        onMouseDown={(event) => {
          event.preventDefault()
          editor.commands.select({ from: 1 as never, to: 6 as never })
          editor.commands.toggleBold()
        }}
      >
        Bold
      </button>
      <EditorContent editor={editor} data-testid="content" />
    </>
  )
}

describe('@matra/react', () => {
  it('mounts the editor into the content element', () => {
    render(<Toolbar />)
    const content = screen.getByTestId('content')
    expect(content.querySelector('.ProseMirror')).not.toBeNull()
    expect(content.textContent).toContain('hello')
  })

  it('mounts once under StrictMode', () => {
    render(
      <StrictMode>
        <Toolbar />
      </StrictMode>,
    )
    const content = screen.getByTestId('content')
    expect(content.querySelectorAll('.ProseMirror')).toHaveLength(1)
  })

  it('re-renders a toolbar when the document changes', () => {
    render(<Toolbar />)
    const button = screen.getByRole('button', { name: 'Bold' })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    fireEvent.mouseDown(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
})
