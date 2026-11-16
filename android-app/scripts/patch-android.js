// Runs in CI after `npx cap add android`: permissions, Google sign-in flag, signing, version.
const fs = require("fs");
const path = require("path");
const A = p => path.join(__dirname, "..", "android", p);
const read = p => fs.readFileSync(A(p), "utf8");
const write = (p, s) => fs.writeFileSync(A(p), s);
const must = (ok, msg) => { if (!ok) { console.error("PATCH FAILED: " + msg); process.exit(1); } };

// 1) permissions: camera + microphone (receipts, voice notes) + biometric + location (where users open the app)
let man = read("app/src/main/AndroidManifest.xml");
const perms = ["android.permission.CAMERA", "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.USE_BIOMETRIC",
  "android.permission.POST_NOTIFICATIONS", "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION"];
for (const p of perms) if (!man.includes(p))
  man = man.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
if (!man.includes("android.hardware.camera"))
  man = man.replace("</manifest>", `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>`);
write("app/src/main/AndroidManifest.xml", man);

// 1b) small monochrome bell icon for reminders
const dr = A("app/src/main/res/drawable");
fs.mkdirSync(dr, { recursive: true });
fs.writeFileSync(path.join(dr, "ic_stat_notify.xml"), `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.9,2 2,2zM18,16v-5c0,-3.07 -1.63,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.64,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z"/>
</vector>
`);

// 2) Google provider for @capacitor-firebase/authentication
let vars = read("variables.gradle");
if (!vars.includes("rgcfaIncludeGoogle")) {
  must(/ext\s*\{/.test(vars), "variables.gradle has no ext block");
  vars = vars.replace(/ext\s*\{/, "ext {\n    rgcfaIncludeGoogle = true");
}
write("variables.gradle", vars);

// 3) version + release signing
let g = read("app/build.gradle");
const vc = process.env.APP_VERSION_CODE || "1";
const vn = process.env.APP_VERSION_NAME || "1.0";
must(/versionCode\s*=?\s*\d+/.test(g), "versionCode not found");
g = g.replace(/versionCode(\s*=?\s*)\d+/, `versionCode$1${vc}`).replace(/versionName(\s*=?\s*)"[^"]*"/, `versionName$1"${vn}"`);
if (!g.includes("signingConfigs")) {
  must(/buildTypes\s*\{/.test(g), "buildTypes not found");
  g = g.replace(/buildTypes\s*\{/, `signingConfigs {
        release {
            storeFile file("release.jks")
            storePassword System.getenv("KS_PASS")
            keyAlias "masareef"
            keyPassword System.getenv("KS_PASS")
        }
    }
    buildTypes {`);
  must(/release\s*\{\s*\n\s*minifyEnabled/.test(g) || /buildTypes\s*\{\s*\n\s*release\s*\{/.test(g), "release buildType not found");
  g = g.replace(/(buildTypes\s*\{\s*\n\s*release\s*\{)/, `$1\n            signingConfig signingConfigs.release`);
}
write("app/build.gradle", g);

// 4) Firebase config
fs.copyFileSync(path.join(__dirname, "..", "google-services.json"), A("app/google-services.json"));
console.log("android project patched: versionCode", vc, "versionName", vn);
