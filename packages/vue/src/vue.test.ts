import { starterKit } from '@matrajs/core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { EditorContent } from './editor-content'
import { useEditor, useEditorState } from './use-editor'

const Toolbar = defineComponent({
  setup() {
    const editor = useEditor({ extensions: starterKit, content: '<p>hello</p>' })
    const isBold = useEditorState(editor, (e) => e.getHTML().includes('<strong>'))

    return () =>
      h('div', [
        h(
          'button',
          {
            'aria-pressed': String(isBold.value),
            onMousedown: (event: MouseEvent) => {
              event.preventDefault()
              editor.commands.select({ from: 1 as never, to: 6 as never })
              editor.commands.toggleBold()
            },
          },
          'Bold',
        ),
        h(EditorContent, { editor, 'data-testid': 'content' }),
      ])
  },
})

describe('@matrajs/vue', () => {
  it('mounts the editor into the content element', () => {
    const wrapper = mount(Toolbar, { attachTo: document.body })
    const content = wrapper.find('.matra-content')
    expect(content.classes()).toContain('matra-editor')
    expect(content.attributes('contenteditable')).toBe('true')
    expect(content.text()).toContain('hello')
    wrapper.unmount()
  })

  it('re-renders a toolbar when the document changes', async () => {
    const wrapper = mount(Toolbar, { attachTo: document.body })
    const button = wrapper.find('button')
    expect(button.attributes('aria-pressed')).toBe('false')

    await button.trigger('mousedown')
    await nextTick()
    expect(button.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('mounts once when the component re-renders', async () => {
    const wrapper = mount(Toolbar, { attachTo: document.body })
    await wrapper.vm.$forceUpdate()
    await nextTick()
    expect(wrapper.findAll('.matra-content p')).toHaveLength(1)
    wrapper.unmount()
  })

  it('destroys the editor when the component goes away', () => {
    const wrapper = mount(Toolbar, { attachTo: document.body })
    const element = wrapper.find('.matra-content').element
    expect(element.hasAttribute('contenteditable')).toBe(true)
    wrapper.unmount()
    expect(element.hasAttribute('contenteditable')).toBe(false)
  })
})
