/**
 * Builds the Android web payload: a Next.js static export, synced into the
 * Capacitor `android/` project.
 *
 * A static export holds only what exists at build time, which rules out two
 * kinds of route: request-time handlers (`src/app/api`, the `src/app/icons`
 * image routes) and dynamic segments keyed by an id nobody knows yet
 * (`/orders/[id]`, `/order-success/[id]`). Those directories are moved aside
 * for the duration of the build and put back afterwards — including when the
 * build fails — so the web build keeps them untouched.
 *
 * The app itself needs no branching for this: `orderHref`
 * (src/lib/order-route.ts) sends native builds to the static
 * `/orders/detail?id=…` page instead of the excluded dynamic route.
 *
 * Usage: npm run build:mobile
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const stash = join(root, ".mobile-build-stash");

// Routes a static export cannot represent, relative to the repo root.
const NOT_EXPORTABLE = [
  "src/app/api",
  "src/app/icons",
  "src/app/orders/[id]",
  "src/app/order-success/[id]",
];

const run = (cmd, args, env) =>
  execFileSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });

const moved = [];

function stashRoutes() {
  mkdirSync(stash, { recursive: true });
  for (const rel of NOT_EXPORTABLE) {
    const from = join(root, rel);
    if (!existsSync(from)) continue;
    const to = join(stash, rel.replaceAll("/", "__"));
    renameSync(from, to);
    moved.push([to, from]);
  }
}

function restoreRoutes() {
  for (const [from, to] of moved.reverse()) {
    if (existsSync(from)) renameSync(from, to);
  }
  moved.length = 0;
  rmSync(stash, { recursive: true, force: true });
}

// Restore even on Ctrl-C, so an interrupted build never leaves the tree gutted.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    restoreRoutes();
    process.exit(1);
  });
}

try {
  stashRoutes();
  run("npx", ["next", "build"], {
    MOBILE_BUILD: "1",
    NEXT_PUBLIC_MOBILE_BUILD: "1",
  });
} finally {
  restoreRoutes();
}

run("npx", ["cap", "sync", "android"]);
