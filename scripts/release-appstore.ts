/**
 * Mac App Store に出すアプリを作る。App Sandbox の中で動く版をビルドし、署名して pkg にまとめる。
 *
 *   bun scripts/release-appstore.ts           署名した pkg を release/ に作る
 *   bun scripts/release-appstore.ts upload    作った pkg を App Store Connect に上げる
 *   bun scripts/release-appstore.ts local     手元で Sandbox の動きを試す版。Apple Development で署名し、pkg は作らない
 *
 * 前もって要るもの（どれも一度だけ。Xcode > Settings > Accounts > Manage Certificates か developer.apple.com で作る）:
 * - キーチェーンに「Apple Distribution」と「Mac Installer Distribution」（3rd Party Mac Developer Installer）の証明書
 * - developer.apple.com で App ID（dev.prompt-code.desktop）と、Mac App Store 用のプロビジョニングプロファイル。
 *   プロファイルは src-tauri/AppStore.provisionprofile に置く（git には入れない）
 * - 上げるなら、App Store Connect の API キー。~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 に置く
 *
 * 環境変数:
 * - APPLE_DISTRIBUTION_IDENTITY  アプリの署名に使う証明書。無ければキーチェーンの最初の Apple Distribution
 * - APPLE_INSTALLER_IDENTITY     pkg の署名に使う証明書。無ければキーチェーンの最初の 3rd Party Mac Developer Installer
 * - APPLE_PROVISIONING_PROFILE   プロファイルの場所。既定は src-tauri/AppStore.provisionprofile
 * - BUILD_NUMBER                 CFBundleVersion。App Store Connect は同じ番号を 2 度受け付けないので、上げるたびに増やす
 * - APPLE_API_KEY, APPLE_API_ISSUER  upload で使う API キーの ID と発行者 ID
 *
 * Developer ID 版（scripts/release-mac.ts）との違いは src-tauri/tauri.appstore.conf.json と Cargo の app-store feature にまとめてある。
 * Tauri には署名させず、sidecar とアプリをこのスクリプトが別々の entitlements で署名し直す
 */
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const APP_NAME = "Prompt Code";
const TARGET = "universal-apple-darwin";
const SIDECAR = "prompt-code-server";
const appPath = join(
  root,
  "src-tauri",
  "target",
  TARGET,
  "release",
  "bundle",
  "macos",
  `${APP_NAME}.app`,
);
const cargoToml = join(root, "src-tauri", "Cargo.toml");

async function run(cmd: string[], options: { quiet?: boolean } = {}): Promise<string> {
  if (options.quiet !== true) console.log(`$ ${cmd.join(" ")}`);
  const proc = Bun.spawn(cmd, { cwd: root, stdout: "pipe", stderr: "inherit" });
  const stdout = await new Response(proc.stdout).text();
  if (options.quiet !== true && stdout.trim() !== "") console.log(stdout.trimEnd());
  if ((await proc.exited) !== 0) throw new Error(`Failed: ${cmd[0]} ${cmd[1] ?? ""}`);
  return stdout;
}

/** キーチェーンから、名前が prefix で始まる証明書を探す。env が指定されていればそれを使う */
async function identity(env: string, prefixes: string[], policy: string[]): Promise<string> {
  const given = process.env[env];
  if (given !== undefined && given !== "") return given;
  const list = await run(["security", "find-identity", "-v", ...policy], { quiet: true });
  for (const prefix of prefixes) {
    const found = new RegExp(`"(${prefix}: [^"]+)"`).exec(list)?.[1];
    if (found !== undefined) return found;
  }
  throw new Error(`No "${prefixes[0]}" certificate in the keychain. Create one, or set ${env}.`);
}

/** 証明書の名前の末尾の (XXXXXXXXXX) がチーム ID */
function teamIdOf(name: string): string {
  const id = /\(([A-Z0-9]{10})\)$/.exec(name)?.[1];
  if (id === undefined) throw new Error(`Could not read the team ID from "${name}"`);
  return id;
}

async function plist(path: string, command: string): Promise<void> {
  await run(["/usr/libexec/PlistBuddy", "-c", command, path]);
}

/**
 * App Store 版をビルドする。Tauri の CLI は tauri.conf.json の macOSPrivateApi に合わせて
 * Cargo.toml の tauri の feature を書き換えるので、終わったら元に戻す
 */
async function build(): Promise<void> {
  const original = await readFile(cargoToml, "utf8");
  try {
    await run(["bun", "run", "build:client"]);
    await run(["bun", "scripts/build-server.ts", TARGET]);
    await run([
      "bunx",
      "tauri",
      "build",
      "--target",
      TARGET,
      "--bundles",
      "app",
      "--no-sign",
      "--config",
      "src-tauri/tauri.appstore.conf.json",
      "--features",
      "app-store",
    ]);
  } finally {
    await writeFile(cargoToml, original);
  }
}

/** sidecar とアプリを、それぞれの entitlements で署名する。子から順に署名する */
async function sign(signer: string, entitlements: string): Promise<void> {
  const sidecar = join(appPath, "Contents", "MacOS", SIDECAR);
  const sidecarEntitlements = join(root, "src-tauri", "Sidecar.entitlements");
  await run([
    "codesign",
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    signer,
    "--entitlements",
    sidecarEntitlements,
    sidecar,
  ]);
  await run([
    "codesign",
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    signer,
    "--entitlements",
    entitlements,
    appPath,
  ]);
  await run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", appPath]);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "pkg";
  if (!["pkg", "upload", "local"].includes(mode)) {
    throw new Error(`Unknown mode: ${mode} (use pkg, upload or local)`);
  }
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    version: string;
  };
  const pkg = join(root, "release", `Prompt-Code_${version}_appstore.pkg`);

  if (mode === "upload") {
    const key = process.env.APPLE_API_KEY;
    const issuer = process.env.APPLE_API_ISSUER;
    if (key === undefined || issuer === undefined)
      throw new Error("Set APPLE_API_KEY and APPLE_API_ISSUER.");
    await run([
      "xcrun",
      "altool",
      "--upload-app",
      "--type",
      "macos",
      "--file",
      pkg,
      "--apiKey",
      key,
      "--apiIssuer",
      issuer,
    ]);
    return;
  }

  const work = await mkdtemp(join(tmpdir(), "prompt-code-appstore-"));
  try {
    const baseEntitlements = join(root, "src-tauri", "AppStore.entitlements");

    if (mode === "local") {
      // プロファイル無しで動かすので、application-identifier は付けない（付けると起動できない）
      const signer = await identity(
        "APPLE_DEVELOPMENT_IDENTITY",
        ["Apple Development"],
        ["-p", "codesigning"],
      );
      await build();
      await sign(signer, baseEntitlements);
      console.log(`\nSandboxed build: ${appPath}\nOpen it from Finder, or: open "${appPath}"`);
      return;
    }

    const signer = await identity(
      "APPLE_DISTRIBUTION_IDENTITY",
      ["Apple Distribution", "3rd Party Mac Developer Application"],
      ["-p", "codesigning"],
    );
    const installer = await identity(
      "APPLE_INSTALLER_IDENTITY",
      ["3rd Party Mac Developer Installer", "Mac Installer Distribution"],
      [],
    );
    const profile =
      process.env.APPLE_PROVISIONING_PROFILE ??
      join(root, "src-tauri", "AppStore.provisionprofile");
    if (!(await Bun.file(profile).exists())) {
      throw new Error(
        `No provisioning profile at ${profile}. Download the Mac App Store profile from developer.apple.com.`,
      );
    }
    const team = teamIdOf(signer);
    console.log(
      `App signing:   ${signer}\nPkg signing:   ${installer}\nProfile:       ${profile}\nVersion:       ${version}\n`,
    );

    await build();

    // App Store が求める情報をアプリに足す
    const contents = join(appPath, "Contents");
    await copyFile(profile, join(contents, "embedded.provisionprofile"));
    const info = join(contents, "Info.plist");
    await plist(info, "Add :ITSAppUsesNonExemptEncryption bool false").catch(() =>
      plist(info, "Set :ITSAppUsesNonExemptEncryption false"),
    );
    if (process.env.BUILD_NUMBER !== undefined)
      await plist(info, `Set :CFBundleVersion ${process.env.BUILD_NUMBER}`);

    // アプリの entitlements に、プロファイルと揃えるチームと App ID を足す
    const entitlements = join(work, "AppStore.entitlements");
    await copyFile(baseEntitlements, entitlements);
    const bundleId = (
      await run(["/usr/libexec/PlistBuddy", "-c", "Print :CFBundleIdentifier", info], {
        quiet: true,
      })
    ).trim();
    await plist(entitlements, `Add :com.apple.application-identifier string ${team}.${bundleId}`);
    await plist(entitlements, `Add :com.apple.developer.team-identifier string ${team}`);

    await sign(signer, entitlements);
    await rm(pkg, { force: true });
    await run([
      "xcrun",
      "productbuild",
      "--sign",
      installer,
      "--component",
      appPath,
      "/Applications",
      pkg,
    ]);
    console.log(
      `\nDone: ${pkg}\nUpload it with: bun scripts/release-appstore.ts upload (or the Transporter app)`,
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await main();
