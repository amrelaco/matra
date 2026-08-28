# IME conformance

The suite runs in happy-dom, which cannot compose text. So the whole of input
method editing — the thing every hand-written editor gets wrong, on the
platforms most of the world types on — is untested by construction, and
[ENGINE.md](../../ENGINE.md) says so.

This is the harness for checking it by hand, on a real device.

```sh
pnpm build                       # the page loads packages/core/dist
python3 -m http.server 8899      # from the repository root
# then open http://localhost:8899/harness/ime/ on the phone,
# using the laptop's LAN address rather than localhost
```

## What it does for you

**It watches for the failure automatically.** An IME bug does not throw. It
looks like the screen and the document quietly disagreeing: a syllable committed
twice, a composition that never reached the model, a correction applied to the
wrong range. The page compares the two after every input — block by block, the
same comparison `render-fuzz.test.ts` makes in happy-dom — and turns red the
moment they part. Once red it stays red, because the interesting state is the
first divergence, not whatever the next keystroke tidied up.

Block by block rather than whole-document, incidentally, because `getText()`
joins blocks with a newline and `textContent` joins them with nothing; comparing
the two as single strings reports an untouched document as data loss.

**It shows what the browser actually sent.** `compositionstart`,
`compositionupdate`, `compositionend`, `beforeinput` and `input`, with their
data and whether `isComposing` was set. When something goes wrong this log is
the difference between a bug report and a guess — the same keystroke produces
very different event sequences on iOS, on Android, and across keyboard apps.

**It builds a report.** User agent, screen size, languages, the first
divergence, every checklist verdict, and the last twenty events. Paste it into
an issue.

## The checklist

Twelve cases, each of which has broken a hand-written editor somewhere: conjunct
formation in Bangla, candidate selection in Japanese and Korean, backspace
before a commit, iOS autocorrect, Android glide typing, the suggestion bar,
caret position after a commit, undo of a composed word, marks over a
composition, Enter mid-composition, surrogate pairs, and composing at the bottom
of a long document.

Mark each pass, fail or n/a as you go. Anything you cannot reproduce is `n/a`
rather than a pass — a keyboard you do not have installed has not been tested,
and recording it as working is how an untested platform becomes a claim.

## Why this is not in CI

Driving a real IME needs a real browser on a real OS with a real keyboard
installed, and the value is in the keyboards a device farm does not have. A
Playwright job would test synthetic `beforeinput` events, which is the part
already covered. This is deliberately manual, and worth running before any
release that touched the view.
