# Jewel (vendored)

The [Jewel design system](https://github.com/willchambers/jewel-design-system)
by Will Chambers, **1.0.0**, copied unmodified from commit
[`70fa57d`](https://github.com/willchambers/jewel-design-system/tree/70fa57d00dbde4eae7b99449da97b6edbecf2e62):

- `css/`, minus `parked/`, `components/_template.css` and `fonts.css` (the
  app loads Inter from `@fontsource-variable/inter` instead).
- `media/icons.svg`, the icon sprite (Lucide, ISC: `media/LICENSE-lucide.txt`).
  `src/components/ui/Icon.tsx` draws from it.

**License:** MIT, see [`LICENSE`](LICENSE).

- **Don't edit these files.** Override tokens or add app components in
  `src/styles/index.scss` and the component `.scss` files. App CSS is
  unlayered, so it beats Jewel's cascade layers without `!important`.
- Only the CSS is used. Jewel's `js/` components manage the DOM themselves
  (open/close, ids, aria state), which conflicts with React, so the React
  components reproduce that behavior against Jewel's markup and class names,
  following each component's "Without Jewel's JS" notes
  (`src/components/ui/Sheet.tsx`, `ui/Tooltip.tsx`, the tabs in
  `PodDetailPanel.tsx`, and so on).
- **To update:** copy `css/` and `media/icons.svg` from a newer upstream
  commit (or tag) over this folder and update the commit above. Then run
  `npm run screenshots` and diff the PNGs.
