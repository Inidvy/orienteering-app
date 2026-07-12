# OL-KA landing site (static)

Public face of ol-ka.de. `index.html` explains OL-KA; `f.html` is the
"you scanned a control" page shown when someone WITHOUT the app scans a plate.

QR plates encode `https://ol-ka.de/f/<UFID>`. On a phone with the app + the
verified domain association, the OS opens the app; otherwise the browser shows
`f.html`, which reads the UFID from the path and offers the app.

## Deploy
Any static host. Routing `/f/<UFID>` -> `f.html`:
- Netlify: `_redirects` (included)
- Vercel: `vercel.json` (included)
- GitHub Pages: no path rewrites — use `/f/?c=<UFID>` in the QR instead
  (f.html reads the `c` query param as a fallback).
