# East Studios - website

Static homepage for East Studios Oy (eaststudios.fi). No build step, no dependencies.

- `index.html` - page markup and copy
- `styles.css` - all styling
- `main.js` - procedural topographic maps (simplex noise + marching squares), scroll reveals, counters, nav, copy-email
- `favicon.svg`

The contour maps in the Topo Maps section and its device mockups are generated in the browser, so there are no image assets to maintain. Motion respects `prefers-reduced-motion`, and the page is fully readable without JavaScript.

## Before going live

App Store links are placeholders. Replace `href="#"` on the elements with these attributes in `index.html`:

- `data-store="topo-ios"` - Topo Maps on the App Store
- `data-store="topo-mac"` - Topo Maps on the Mac App Store
- `data-store="bird-ios"` - Bird Guide - Finland on the App Store

## Local preview

```sh
python3 -m http.server 8000
```

Deploys as-is to Netlify, Coolify/Nginx or any static host.
