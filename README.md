# S-CAD mobile (Android + iOS)
Capacitor wrapper around the fully offline S-CAD web app, with built-in user guide (src/help.js),
native PNG sharing and a "Share web copy" button (src/native-shim.js).

- Build on GitHub: Actions > "Build S-CAD Android" > Run workflow. Without signing secrets it makes a debug APK; with them it makes a signed AAB + APK.
- Google Play steps, listing text and policy: store/PLAY-STORE-GUIDE.md and store/PRIVACY-POLICY.md.
- Logo and icon sources: assets/ (SVG + PNG). Store graphics: store/.
- iOS: Actions > "Build S-CAD iOS (simulator test only)". Real iPhones need Xcode on a Mac and an Apple Developer account.
