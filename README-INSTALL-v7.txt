# Farm Ledger v7 — Installable PWA

Upload the CONTENTS of this folder to the ROOT of the GitHub Pages repository.

Required files:
- index.html
- manifest.webmanifest
- service-worker.js
- icons/icon-192.png
- icons/icon-512.png
- icons/icon-512-maskable.png
- icons/apple-touch-icon-180.png

## Android Chrome
Open the deployed HTTPS GitHub Pages URL in Chrome. Interact with the page. When Chrome makes the PWA installable, use Chrome's Install app option or the Farm Ledger install prompt.

Do not install from the github.com repository page. Install from the deployed github.io site.

Chrome's install prompt depends on browser installability conditions and may not appear immediately.

## iPhone/iPad
Open the deployed URL in Safari. Tap Share -> Add to Home Screen. Safari uses the manifest to treat it as a web app.

## GitHub Pages
Keep the file names and folders exactly as supplied. GitHub Pages must be serving the repository over HTTPS.

## Important
This is a PWA, not an APK or App Store package. Firebase data/authentication remains online functionality.
