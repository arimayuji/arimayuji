/**
 * Checks whether a newer build of the native app has been published than
 * the one currently installed. There is no Play Store here to auto-update
 * for the user — this is the substitute: compare the installed build
 * number against `version.json`, published alongside the APK by
 * `.github/workflows/android-build.yml` on every deploy to `main`.
 *
 * Android only, on purpose: `version.json`'s `versionCode` is Android's
 * versionCode, which means nothing on iOS (`App.getInfo().build` there is
 * iOS's own CFBundleVersion — an unrelated numbering series, so comparing it
 * against an Android versionCode is meaningless at best). iOS testers
 * already get their own native "update available" notification from the
 * TestFlight app itself whenever a new build finishes processing — this
 * in-app nudge would only ever duplicate that.
 *
 * `remote.url` points at `/download` (an instructions page, see
 * src/app/download/page.tsx) rather than the raw `.apk` — linking straight
 * at the binary handed Chrome's "arquivo pode ser nocivo" interstitial to
 * the user with zero context.
 */
import { App } from "@capacitor/app";
import { isAndroidPlatform } from "@/lib/platform";

const VERSION_URL = "https://xanthus.app.br/download/version.json";

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  url: string;
}

/**
 * Resolves to the remote version info if it's newer than the installed
 * build, or `null` if already current, on web, or on any failure (offline,
 * malformed response, etc. — an update check must never block or crash the
 * app it's checking on behalf of).
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isAndroidPlatform()) return null;
  try {
    const [info, response] = await Promise.all([
      App.getInfo(),
      fetch(VERSION_URL, { cache: "no-store" }),
    ]);
    if (!response.ok) return null;
    const remote = (await response.json()) as UpdateInfo;
    // `AppInfo.build` is Android's versionCode, exposed as a string.
    const installedBuild = Number(info.build);
    if (!Number.isFinite(installedBuild) || !Number.isFinite(remote.versionCode)) return null;
    if (remote.versionCode <= installedBuild) return null;
    return remote;
  } catch {
    return null;
  }
}
