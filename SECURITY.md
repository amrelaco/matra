# Security

## The model

A rich text editor is a place untrusted content arrives from at least three
directions, and all three are treated as hostile:

| route | example |
|---|---|
| document JSON | a document loaded from your database, written by a user |
| pasted HTML | anything the clipboard contains |
| collaborative steps | a message from another client |

Validation that lives only in `parseDOM` or only in a command is bypassed by the
other two routes. **The last gate is the rendering path**, in
`engine/model/safe-attrs.ts`, which every route passes through.

## What is enforced

- **Executable attributes are never set.** Anything matching `on*`, plus
  `srcdoc`.
- **URL attributes are scheme-checked** — `href`, `src`, `xlink:href`,
  `action`, `formaction`, `poster`, `data`. `javascript:`, `vbscript:` and
  `data:` are refused, except `data:image/*` on `src`, which is a legitimate
  inline image.
- **Undeclared attributes are dropped.** A node type that declares no `attrs`
  gets none, so a type whose `toDOM` renders `node.attrs` cannot be fed
  arbitrary keys through JSON.
- **Protocol-relative URLs are refused.** `//evil.example` inherits the page
  protocol and leaves your site.
- **Content expressions are bounded** — repeat counts to 500, total automaton
  states to 5000. `heading{1,1000000}` is a denial of service dressed as a
  schema.
- **Commands never throw.** A command reports success as a boolean; one that
  throws is caught, logged, and its half-built transaction discarded. A hostile
  step cannot take the editor down.
- **Positions are validated** as finite integers inside the document. `NaN`
  slips past naive range checks, because `NaN < 0` and `NaN > size` are both
  false.

## What is your responsibility

- **`getHTML()` output still needs a policy at rest.** It is safe to render in
  the editor; if you store it and serve it elsewhere, apply your own sanitiser
  at that boundary too. Defence in depth is the point.
- **Node views and widget decorations are your code.** The editor keeps their
  DOM out of the document, but it cannot audit what you build inside them. Do
  not `innerHTML` untrusted strings there.
- **A custom `toDOM` should still validate.** The gate above will refuse an
  executable attribute, but it cannot know that your `data-user-id` came from
  somewhere it should not have.

## Reporting

Open an issue at https://github.com/amrelaco/matra/issues, or email
security@amrela.co for anything you would rather not post publicly.
