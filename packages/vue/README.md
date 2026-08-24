# @matrajs/vue

Vue 3 bindings for Matra: `useEditor`, `useEditorState`, `useEditorFocus` and
`EditorContent`.

```bash
npm i @matrajs/core @matrajs/vue
```

```vue
<script setup lang="ts">
import { starterKit } from '@matrajs/core'
import { EditorContent, useEditor, useEditorState } from '@matrajs/vue'

const editor = useEditor({ extensions: starterKit, content: '<p>Hello</p>' })
const isBold = useEditorState(editor, (e) => e.getHTML().includes('<strong>'))
</script>

<template>
  <button :aria-pressed="isBold" @mousedown.prevent="editor.commands.toggleBold()">
    Bold
  </button>
  <EditorContent :editor="editor" />
</template>
```

The editor is `markRaw`-ed on purpose: it is a mutable object with its own
change events, and putting it in Vue's reactivity graph would trace every
document node on every keystroke. Read from it with `useEditorState`.

- Source: https://github.com/amrelaco/matra

MIT.
