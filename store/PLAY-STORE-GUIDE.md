# Publishing S-CAD on Google Play

## 0. One-time setup (GitHub)
1. Add the 4 secrets from GITHUB-SECRETS.txt: repo > Settings > Secrets and variables > Actions.
2. Push this project. Actions > "Build S-CAD Android" > Run workflow (version name 1.0.0).
3. Download artifact **S-CAD-release**: it has `app-release.aab` (for Google Play) and `app-release.apk` (signed, installable, shareable).
Every run gets a higher version code automatically, so each new build can be uploaded as an update.

## 1. Google Play Console
1. Create a developer account at play.google.com/console (one-time US$25 fee, ID verification).
2. Create app: name "S-CAD", default language English, App, Free.
3. Privacy policy: put PRIVACY-POLICY.md in a PUBLIC GitHub repository (e.g. `scad-privacy`) and paste that file's web address into the Play Console.
4. App content (all in the left menu):
   - Ads: No. App access: all functionality available without login.
   - Content rating: fill the questionnaire (no violence, no user-generated content sharing, no location): result is Everyone.
   - Target audience: 18+ (or 13+). Not designed for children.
   - Data safety: "No data collected", "No data shared".
   - Government / financial / health / news apps: No.
5. Store listing: paste the text below, upload `play-icon-512.png`, `feature-graphic-1024x500.png`, and at least 2 phone screenshots (take them on your phone with a real DWG and a 3D model open).
6. Production (or Testing) > Create release > upload `app-release.aab`. Choose "Use Play App Signing" when asked. Release notes: "First release."
7. New personal developer accounts may first have to run a closed test with a minimum number of testers for a number of days before Production is allowed. Play Console shows the current requirement on the Dashboard.

## Store listing text
**App name:** S-CAD: DWG, SKP & GLB Viewer

**Short description (80 chars max):** Open AutoCAD DWG, SketchUp and GLB files offline. Measure, section, export.

**Full description:**
S-CAD is a fast, private viewer for CAD and 3D files. Open AutoCAD (.dwg), SketchUp (.skp) and GLB models right on your phone. Everything works offline and your files never leave your device.

DWG drawings: layers, hatches, linetypes, lineweights, text, blocks, tables and a scale bar. Pan, zoom, measure distances and choose drawing units.

SketchUp and GLB models: orbit, pan and zoom; Iso, Top, Front, Back, Left and Right views; saved scenes; outline tree; tags; line thickness; perspective or orthographic.

Section cuts: cut along X, Y or Z, flip the side, and export the cut view.

Export: save a PNG of the current view or the whole drawing at up to 8x resolution, with a scale bar and optional transparent background.

Share: send a copy of the offline web version to anyone, even if they do not install the app.

Built-in user guide, light and dark themes. No account, no ads, no tracking.

S-CAD is a viewer: it does not edit drawings.

## Important
- The app id `com.scad.viewer` (capacitor.config.json) is permanent once published. Change it BEFORE your first upload if you want a different one (for example com.yourname.scad).
- Back up scad-upload.jks and its passwords somewhere safe.
- "AutoCAD" and "SketchUp" are trademarks of their owners. S-CAD is not affiliated with them; the listing only says what file types it opens.
