FARM LEDGER — INSTALLABLE PWA v6

Upload all files/folders in this package to the root of your GitHub Pages repository.

Required structure:
index.html
manifest.webmanifest
service-worker.js
icons/
  icon-192.png
  icon-512.png
  icon-512-maskable.png
  apple-touch-icon-180.png

After deployment:
1. Open the GitHub Pages site, not github.com.
2. Android Chrome: use the Install option / browser menu.
3. iPhone/iPad Safari: Share -> Add to Home Screen.
4. If an older version is already installed, open it online once so the service worker can detect the update.

PWA v6 adds:
- standalone app display
- iOS safe-area support
- iOS home-screen icon
- app-style splash screen
- install prompt where supported
- online/offline status banner
- cached app shell for offline opening
- update detection and one-tap update/reload
- 30-minute background update checks while open

Note: Firebase live authentication/database operations still require network access unless the browser/Firebase SDK has already established its own supported local persistence. The service worker does not cache or alter Firebase data.
