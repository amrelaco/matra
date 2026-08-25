# Browser benchmark

The view numbers that matter come from here, not from happy-dom.

```sh
# from a scratch directory with tiptap installed for the comparison
npm i @tiptap/core @tiptap/starter-kit @tiptap/pm esbuild
cp -r <matra>/packages/core/dist matra-dist
npx esbuild bench.src.js --bundle --format=esm --outfile=bench.js
python3 -m http.server 8899
# then open http://localhost:8899/
```

Each figure is the **median of seven samples**, after five warm-up rounds, with
a forced layout read each round so the DOM work is actually done. That is not
ceremony: a single sample moved one metric by 6× between runs on a change that
could not affect it. One sample is a story, not a measurement.
