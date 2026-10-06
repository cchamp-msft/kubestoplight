# Jewel (vendored)

The CSS of the [Jewel design system](https://github.com/willchambers/jewel-design-system)
by Will Chambers, copied unmodified from commit
[`8b6c6c6`](https://github.com/willchambers/jewel-design-system/tree/8b6c6c699f32f2cabd27e14b1412cd9481422b20/css)
(`css/`, minus `parked/` and `components/_template.css`).

**License:** the upstream repo has no license file yet. It is included here at
the author's request for evaluation; it must be licensed upstream before this
is released.

- **Don't edit these files.** Override tokens or add app components in
  `src/styles/index.scss` and the component `.scss` files. App CSS is
  unlayered, so it beats Jewel's cascade layers without `!important`.
- Only the CSS is used. Jewel's `js/` components manage the DOM themselves
  (open/close, ids, aria state), which conflicts with React, so the React
  components reproduce that behavior against Jewel's markup and class names
  (`src/components/ui/Sheet.tsx`, tabs in `PodDetailPanel.tsx`, and so on).
- **To update:** copy `css/` from a newer upstream commit over this folder and
  update the commit above. Then run `npm run screenshots` and diff the PNGs.
