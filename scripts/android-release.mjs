// Run after `npx cap add android`. Sets version numbers and (if env vars are set) release signing.
import { readFileSync, writeFileSync } from 'node:fs';
const f = 'android/app/build.gradle';
let g = readFileSync(f, 'utf8');
const need = (re, what) => { if (!re.test(g)) throw new Error('android-release: could not find ' + what + ' in ' + f); };

const code = process.env.SCAD_VERSION_CODE || '1';
const name = process.env.SCAD_VERSION_NAME || '1.0.0';
need(/versionCode\s*=?\s*\d+/, 'versionCode'); need(/versionName\s*=?\s*"[^"]*"/, 'versionName');
g = g.replace(/versionCode\s*=?\s*\d+/, `versionCode ${code}`).replace(/versionName\s*=?\s*"[^"]*"/, `versionName "${name}"`);

if (process.env.SCAD_KEYSTORE) {
  need(/buildTypes\s*\{/, 'buildTypes'); need(/release\s*\{/, 'release build type');
  const signing = `    signingConfigs {
        release {
            storeFile file(System.getenv('SCAD_KEYSTORE'))
            storePassword System.getenv('SCAD_STORE_PASS')
            keyAlias System.getenv('SCAD_KEY_ALIAS')
            keyPassword System.getenv('SCAD_KEY_PASS')
        }
    }
`;
  const i = g.search(/buildTypes\s*\{/);
  const ls = g.lastIndexOf('\n', i) + 1;               // start of the "buildTypes {" line
  const before = g.slice(0, ls), rest = g.slice(ls);
  const rest2 = rest.replace(/release\s*\{/, 'release {\n            signingConfig signingConfigs.release');
  g = before + signing + '\n' + rest2;
}
writeFileSync(f, g);
console.log(`Patched ${f}: versionCode ${code}, versionName ${name}, signing ${process.env.SCAD_KEYSTORE ? 'on' : 'off'}`);
