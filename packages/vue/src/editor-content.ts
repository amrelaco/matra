import type { AnyDef, Editor } from '@matrajs/core'
import { type PropType, defineComponent, h, onMounted, ref } from 'vue'

/**
 * The element the editor mounts into.
 *
 * The mount is guarded on `unsafe.view`, so a component remounted by a
 * `<KeepAlive>` or a hot reload does not attach a second view to one element.
 */
export const EditorContent = defineComponent({
  name: 'EditorContent',
  props: {
    editor: {
      type: Object as PropType<Editor<readonly AnyDef[]>>,
      required: true,
    },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null)

    onMounted(() => {
      const element = root.value
      if (!element || props.editor.unsafe.view) return
      props.editor.mount(element)
    })

    return () => h('div', { ref: root, class: 'matra-content' })
  },
})
