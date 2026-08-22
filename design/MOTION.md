# Motion spec — Matra & Amrela

Animation is part of the design, not decoration added later. Everything below is
implementable with CSS and the Web Animations API. No animation library needed.

## Principles

1. **Motion explains, it doesn't perform.** Every animation answers "where did this
   come from" or "what just changed." If it answers neither, cut it.
2. **One orchestrated moment per page.** A page-load sequence that lands well beats
   twelve scattered hover effects.
3. **Respect `prefers-reduced-motion`.** Every rule below collapses to opacity-only
   or nothing. This is not optional.

## Tokens

```css
--ease-out:  cubic-bezier(0.16, 1, 0.3, 1);     /* entrances — fast then settle */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);  /* state changes */
--dur-fast: 140ms;   /* hovers, toggles */
--dur-base: 320ms;   /* entrances, panels */
--dur-slow: 720ms;   /* hero sequence beats */
```

## The hero sequence (the one orchestrated moment)

Runs once on load, ~1.4s total. Each beat overlaps the previous by ~60%.

| Beat | Element | From | Duration |
|---|---|---|---|
| 0ms | The matra rule under the nav | `scaleX(0)`, origin left | 720ms |
| 180ms | Badge | `opacity 0, translateY(8px)` | 320ms |
| 260ms | Headline, per line | `opacity 0, translateY(14px)` | 420ms, 80ms stagger |
| 480ms | Subhead + CTAs | `opacity 0, translateY(10px)` | 320ms |
| 560ms | Facts column, per row | `opacity 0, translateY(10px)` | 320ms, 70ms stagger |
| 700ms | Code panel | `opacity 0, translateY(16px)` | 420ms |
| 1000ms | Code lines, per line | `opacity 0` | 200ms, 40ms stagger — reads as typing |
| 1240ms | Selection highlight in the editor | `scaleX(0)`, origin left | 300ms |

The headline lines animating separately is what makes it feel considered rather
than a single fade. The code lines staggering is the signature moment — it reads
as the file being written.

## Scroll

- **Section reveal** — `opacity 0 → 1`, `translateY(20px) → 0`, 420ms, triggered
  at 15% into viewport, once. Never re-trigger on scroll up.
- **Stat numbers** — count from 0 on first reveal, 900ms, `--ease-out`. Only for
  integers; `4 kB` and `MIT` just fade.
- **The hanging extension stems** — `scaleY(0)` → `1`, origin top, 60ms stagger
  left to right. The line drops its stems as you scroll to it.
- **Sticky nav** — after 80px, background goes from transparent to `--paper` with
  a `--rule` bottom border, 180ms. No shrink, no shadow.

## Interaction

| Element | Behaviour |
|---|---|
| Button | `background` shift only, 140ms. No lift, no scale, no shadow. |
| Nav link | underline `scaleX(0→1)` from left, 140ms |
| Card | `border-color` → `--rule-strong`, 140ms. Nothing moves. |
| Code copy | icon swaps to a check, 160ms, reverts after 1.4s |
| Slash palette | `opacity 0 → 1` + `translateY(-6px)`, 160ms, `--ease-out` |
| Bubble menu | same as palette but origin is the selection |
| Theme toggle | crossfade tokens over 240ms — never a flash of the wrong theme |

## Product-specific: AI streaming

The most important animation in the product, because it's the differentiator.

- Suggested text arrives **token by token**, 18–24ms apart, no cursor jump.
- The replaced range holds a `--indigo-wash` background that fades out over 400ms
  once applied — showing exactly what changed and where.
- If positions were re-mapped because the user typed during the request, the
  landing range flashes `--indigo-wash` twice. That is the feature made visible.

## What we do not do

- No parallax. No scroll-jacking. No cursor followers.
- No shadows appearing on hover — the system has no shadows at all.
- No 3D or WebGL. 61% of Awwwards winners use it; it would fight a developer
  audience that wants to read documentation, and it costs performance we sell on.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```
The hero sequence becomes a single 120ms fade. Streaming text appears complete.
