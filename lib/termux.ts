import { requireNativeModule } from 'expo-modules-core';

import { Platform } from 'react-native';

/**
 * On-device OpenCode via Termux RUN_COMMAND.
 *
 * Deployment model (proven on device, 2026-08-19): opencode v1.18.18 runs from
 * source under the official Android Bun v1.3.14 build (arm64) inside Termux.
 * `bun build --compile` standalone artifacts segfault at pre-init on Android
 * (Bun bug, `bun.report/1.3.14/L_10d9b296...`), so there is no bundled binary —
 * setup clones the pinned tag and installs dependencies, and the serve command
 * runs `src/index.ts` directly.
 */

export const TERMUX_SERVER_PORT = 4096;

/** The URL the app uses to reach the on-device server. */
export const TERMUX_SERVER_URL = `http://127.0.0.1:${TERMUX_SERVER_PORT}`;

export const TERMUX_RUN_COMMAND_PERMISSION = 'com.termux.permission.RUN_COMMAND';

/**
 * One-liner to run inside a Termux session. RUN_COMMAND is rejected by Termux
 * itself until `allow-external-apps=true` is set, even when the runtime
 * permission is granted — and Termux rejects those intents asynchronously, so
 * the app cannot detect the missing property. The user pastes this in Termux,
 * then restarts Termux (its properties are cached per-process).
 */
export const TERMUX_ALLOW_EXTERNAL_APPS_COMMAND =
  "mkdir -p ~/.termux && printf '\\nallow-external-apps=true\\n' >> ~/.termux/termux.properties";

const TERMUX_PREFIX = '/data/data/com.termux/files/usr';
const TERMUX_HOME = '/data/data/com.termux/files/home';
const TERMUX_BUN = `${TERMUX_PREFIX}/libexec/bun/bun`;
const TERMUX_SHELL = `${TERMUX_PREFIX}/bin/sh`;
const OPENCODE_REPO = `${TERMUX_HOME}/opencode`;
const OPENCODE_ENTRY = `${OPENCODE_REPO}/packages/opencode/src/index.ts`;
const OPENCODE_VERSION_TAG = 'v1.18.18';
const BUN_VERSION = '1.3.14';
const FFI_BUN_VERSION = '0.10.5';
const FFI_BIN_ARM64 = '@ff-labs/fff-bin-android-arm64@0.10.5-dev.774d6bc';

/**
 * One-shot device setup, executed inside Termux (visible session). Mirrors the
 * exact steps verified on the phone: official Bun android binary, opencode at
 * the pinned tag, the fff-bun android-safe bump, ripgrep, and the
 * `allow-external-apps` property RUN_COMMAND requires. Idempotent.
 */
export const TERMUX_SETUP_SCRIPT = `#!/data/data/com.termux/files/usr/bin/sh
set -e
PREFIX=${TERMUX_PREFIX}
HOME_DIR=${TERMUX_HOME}
BUN="$PREFIX/libexec/bun/bun"
# Some devices reject the hardlinks bun's installer creates (EACCES:
# Permission denied). Force the copy backend for install/add.
export BUN_OPTIONS="--backend=copyfile"
ARCH=$(uname -m)
echo "[setup] arch=$ARCH"
case "$ARCH" in
  aarch64) BUN_ZIP="bun-linux-aarch64-android.zip"; FFI_BIN="${FFI_BIN_ARM64}" ;;
  x86_64)  BUN_ZIP="bun-linux-x64-android.zip";    FFI_BIN="" ;;
  *) echo "[setup] unsupported arch: $ARCH"; exit 1 ;;
esac
echo "[setup] installing packages (unzip, git, ripgrep)..."
pkg install -y unzip git ripgrep
if [ ! -x "$PREFIX/libexec/bun/bun" ]; then
  echo "[setup] installing Bun ${BUN_VERSION} ($ARCH)..."
  mkdir -p "$PREFIX/libexec/bun" "${TERMUX_PREFIX}/tmp/bun-setup"
  curl -fsSL -o "${TERMUX_PREFIX}/tmp/bun-setup/bun.zip" "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/\${BUN_ZIP}"
  cd "${TERMUX_PREFIX}/tmp/bun-setup" && unzip -o bun.zip
  case "$ARCH" in
    aarch64) cp bun-linux-aarch64-android/bun "$PREFIX/libexec/bun/bun" ;;
    x86_64)  cp bun-linux-x64-android/bun "$PREFIX/libexec/bun/bun" ;;
  esac
  chmod 755 "$PREFIX/libexec/bun/bun"
fi
"$PREFIX/libexec/bun/bun" --version
if [ ! -d "$HOME_DIR/opencode/.git" ]; then
  echo "[setup] cloning opencode ${OPENCODE_VERSION_TAG}..."
  git clone --depth 1 --branch ${OPENCODE_VERSION_TAG} https://github.com/sst/opencode.git "$HOME_DIR/opencode"
fi
cd "$HOME_DIR/opencode"
echo "[setup] installing dependencies..."
"$BUN" install --ignore-scripts || "$BUN" install --ignore-scripts --no-cache
echo "[setup] upgrading fff-bun for android..."
cd packages/core
if [ -n "$FFI_BIN" ]; then
  "$BUN" add --ignore-scripts @ff-labs/fff-bun@${FFI_BUN_VERSION} "$FFI_BIN" || "$BUN" add --ignore-scripts --no-cache @ff-labs/fff-bun@${FFI_BUN_VERSION} "$FFI_BIN"
else
  "$BUN" add --ignore-scripts @ff-labs/fff-bun@${FFI_BUN_VERSION} || "$BUN" add --ignore-scripts --no-cache @ff-labs/fff-bun@${FFI_BUN_VERSION}
fi
mkdir -p "$HOME_DIR/.termux"
if ! grep -q '^allow-external-apps=' "$HOME_DIR/.termux/termux.properties" 2>/dev/null; then
  printf '\\nallow-external-apps=true\\n' >> "$HOME_DIR/.termux/termux.properties"
fi
echo "[setup] clearing install caches..."
rm -rf "$HOME_DIR/.bun/install/cache" "$HOME_DIR/.cache" 2>/dev/null || true
rm -f "$PREFIX/var/cache/apt/archives"/*.deb 2>/dev/null || true
echo "[setup] done. OpenCode is ready to serve on port ${TERMUX_SERVER_PORT}."`;

/**
 * Starts the on-device OpenCode server in a background Termux session. Runs
 * from Termux home (always readable/writable by Termux — no storage
 * permission needed; /sdcard is rejected by RunCommandService when Termux
 * lacks storage access). Note: Bun's startup probe walks up from cwd; /data
 * and /data/data are only searchable (mode 0711), not listable, so a probe
 * that lists ancestors would fail from home. If that ever surfaces
 * (EACCES at Bun startup), the serve command needs a non-/data cwd such as
 * /storage/emulated/0/Android/data/com.termux.
 */
const TERMUX_SERVE_COMMAND = `exec ${TERMUX_BUN} run --disable-bunfig --conditions=browser ${OPENCODE_ENTRY} serve --hostname 127.0.0.1 --port ${TERMUX_SERVER_PORT}`;

export type TermuxStatus = {
  available: boolean;
  installed: boolean;
  hasRunCommandPermission: boolean;
  termuxVersion?: string;
};

export type TermuxLaunchResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'termux-not-installed' | 'permission-denied' | 'launch-failed';
      detail?: string;
    };

type TermuxLauncherModule = {
  getStatus(): Promise<TermuxStatus>;
  requestRunCommandPermission(): Promise<{ granted: boolean }>;
  launch(request: {
    executable: string;
    args: string[];
    workdir?: string;
    environment?: string[];
    background: boolean;
  }): Promise<TermuxLaunchResult>;
};

let cachedModule: TermuxLauncherModule | null | undefined;

function getTermuxLauncher(): TermuxLauncherModule | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }
  try {
    const module = requireNativeModule('TermuxLauncher');
    cachedModule = (Platform.OS === 'android' ? module : null) as TermuxLauncherModule | null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export async function getTermuxStatus(): Promise<TermuxStatus> {
  const module = getTermuxLauncher();
  if (!module) {
    return { available: false, installed: false, hasRunCommandPermission: false };
  }
  return module.getStatus();
}

export async function requestTermuxRunCommandPermission(): Promise<boolean> {
  const module = getTermuxLauncher();
  if (!module) {
    return false;
  }
  const result = await module.requestRunCommandPermission();
  return result.granted;
}

/**
 * Ensures the RUN_COMMAND grant before a launch, showing the system
 * permission dialog when it is missing. Returns an error result instead of
 * null when the launch cannot proceed (Termux missing or permission refused).
 */
async function ensureTermuxReady(): Promise<TermuxLaunchResult | null> {
  const module = getTermuxLauncher();
  if (!module) {
    return { ok: false, reason: 'launch-failed', detail: 'Termux launcher unavailable on this platform.' };
  }
  const status = await module.getStatus();
  if (!status.installed) {
    return { ok: false, reason: 'termux-not-installed' };
  }
  if (!status.hasRunCommandPermission) {
    const granted = await requestTermuxRunCommandPermission();
    if (!granted) {
      return { ok: false, reason: 'permission-denied', detail: 'Run command access was not granted.' };
    }
  }
  return null;
}

function createLaunchRequest(script: string, background: boolean) {
  return {
    executable: TERMUX_SHELL,
    args: ['-lc', script],
    workdir: TERMUX_HOME,
    background,
  };
}

export async function startTermuxSetup(): Promise<TermuxLaunchResult> {
  const blocker = await ensureTermuxReady();
  if (blocker) {
    return blocker;
  }
  const module = getTermuxLauncher();
  if (!module) {
    return { ok: false, reason: 'launch-failed', detail: 'Termux launcher unavailable on this platform.' };
  }
  return module.launch(createLaunchRequest(TERMUX_SETUP_SCRIPT, false));
}

export async function startTermuxServer(): Promise<TermuxLaunchResult> {
  const blocker = await ensureTermuxReady();
  if (blocker) {
    return blocker;
  }
  const module = getTermuxLauncher();
  if (!module) {
    return { ok: false, reason: 'launch-failed', detail: 'Termux launcher unavailable on this platform.' };
  }
  return module.launch(createLaunchRequest(TERMUX_SERVE_COMMAND, true));
}