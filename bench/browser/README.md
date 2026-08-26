# Browser benchmark

Four editors — Matra, Tiptap, Lexical and Slate — in one page, in one run. The
view numbers that matter come from here, not from happy-dom.

```sh
# from a scratch directory
npm i @tiptap/core @tiptap/starter-kit @tiptap/pm \
      lexical @lexical/rich-text @lexical/html \
      slate slate-react slate-dom slate-history react react-dom esbuild
cp -r <matra>/packages/core/dist matra-dist
cp <matra>/bench/browser/{bench.src.js,index.html} .
npx esbuild bench.src.js --bundle --format=esm --outfile=bench.js \
  --define:process.env.NODE_ENV='"production"'
python3 -m http.server 8899
# then open http://localhost:8899/
```

Each figure is the **median of seven samples**, after five warm-up rounds, with
a forced layout read each round so the DOM work is actually done. That is not
ceremony: a single sample moved one metric by 6× between runs on a change that
could not affect it. One sample is a story, not a measurement. Reload two or
three times and take the median of the runs as well — the keystroke row on a
long document swings by 30% between runs for every editor here.

## The floor

One row has no editor in it: the same paragraphs built by hand into a
`contenteditable` div. Putting a document on screen is mostly the browser making
elements, and without that line the mount rows read as a comparison of four
editors when most of what they measure is one browser with itself.

## What it checks

Every mount is verified rather than trusted. After the timing, the harness
mounts once more and looks for the last paragraph's text on screen; if it is not
there, it prints `NOT MEASURED` instead of a number. A reconciler that returns
before its DOM exists is the cheapest possible way to win a mount row.

Teardown runs **after** the clock stops. This matters more than it sounds: the
layout read is what makes a render measurement real, and an editor whose
teardown detaches its DOM would have taken its document off screen before that
read — so the browser's cost, which is most of the mount row, would land on
whoever was still drawn. This harness ran that way for a while and reported
Lexical at half Matra's mount for exactly that reason.

## What it refuses to report

Slate's keystroke goes through a React render. `flushSync` does not always land
it before the timer stops, and the harness checks the editor's text actually
changed during the measurement; when it did not, it prints `NOT MEASURED`
rather than a number. The first version of this file happily reported Slate at
0.02 ms per keystroke, which was the model update with no screen behind it.

## What is not like-for-like

Each editor is driven through its own idiomatic API, which is the only fair way
to do it and also the caveat worth stating: Lexical and Slate are loaded with
the rich-text behaviour their own quick-starts prescribe, and that is not the
same feature set as Matra's or Tiptap's starter kits.
