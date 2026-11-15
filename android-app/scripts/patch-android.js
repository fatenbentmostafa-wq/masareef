// Runs in CI after `npx cap add android`: permissions, Google sign-in flag, signing, version.
const fs = require("fs");
const path = require("path");
const A = p => path.join(__dirname, "..", "android", p);
const read = p => fs.readFileSync(A(p), "utf8");
const write = (p, s) => fs.writeFileSync(A(p), s);
const must = (ok, msg) => { if (!ok) { console.error("PATCH FAILED: " + msg); process.exit(1); } };

// 1) permissions: camera + microphone (receipts, voice notes) + biometric
let man = read("app/src/main/AndroidManifest.xml");
const perms = ["android.permission.CAMERA", "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.USE_BIOMETRIC"];
for (const p of perms) if (!man.includes(p))
  man = man.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
if (!man.includes("android.hardware.camera"))
  man = man.replace("</manifest>", `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>`);
write("app/src/main/AndroidManifest.xml", man);

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
