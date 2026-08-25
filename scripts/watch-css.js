// tsup's own watcher only tracks files reachable through esbuild's module
// graph. This package's CSS files never enter that graph — they're copied
// into dist/ by tsup.config.js's onSuccess hook, which only runs after a
// JS/JSX-triggered build — so a CSS-only edit is invisible to `tsup --watch`
// and silently leaves dist/*.css stale until some unrelated JS file happens
// to change too. This script runs alongside `tsup --watch` (see the "dev"
// script) and copies a changed .css file into dist/ immediately, using
// Node's native recursive fs.watch — no extra dependency needed.
import { watch, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";

const SRC_DIR = "src";
const DIST_DIR = "dist";

function copyCssFile(relPath) {
  const src = join(SRC_DIR, relPath);
  const dest = join(DIST_DIR, relPath);
  if (!existsSync(src)) return; // deleted/renamed mid-event
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`[watch-css] copied ${relPath}`);
}

watch(SRC_DIR, { recursive: true }, (_event, filename) => {
  if (!filename || extname(filename) !== ".css") return;
  copyCssFile(filename.split("\\").join("/"));
});

console.log("[watch-css] watching src/**/*.css for changes...");
