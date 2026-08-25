import { defineConfig } from "tsup";
import { globSync } from "glob";
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";

const entry = globSync("src/**/*.{js,jsx}", { ignore: ["src/**/*.test.*"] }).map(
  (p) => p.replace(/\\/g, "/")
);

function copyCssAssets() {
  const cssFiles = globSync("src/**/*.css").map((p) => p.replace(/\\/g, "/"));
  for (const file of cssFiles) {
    const dest = join("dist", file.slice("src/".length));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
  }
}

// clean:true wiping dist/ on every rebuild is safe for a one-shot `tsup`
// build, but under `tsup --watch` it re-runs on every single incremental
// rebuild too — two file changes in quick succession (routine during active
// editing) fire two overlapping rebuild passes, each of which deletes the
// entire dist/ directory at its start. Whichever pass's delete lands after
// the other pass has already started writing its own output empties dist/
// out from under it, and files that pass never gets around to rewriting
// (or writes just as the other pass deletes them again) are left missing —
// this is the exact intermittent "Module not found: Can't resolve
// '.../foo.js'" failure hit repeatedly against Amritara_New_NextJs's dev
// server, and it reproduces because tsup's watch mode has no cross-run
// locking around the clean step. Cleaning once when the watcher starts
// (scripts/dev.js does this itself, once, before spawning `tsup --watch`)
// and never again for the lifetime of that watch session removes the
// overlapping-clean race entirely, since every subsequent rebuild only
// ever writes files, never deletes the directory out from under itself.
const isWatch = process.argv.includes("--watch");

export default defineConfig({
  entry,
  format: ["esm"],
  target: "es2020",
  bundle: false,
  splitting: false,
  sourcemap: true,
  clean: !isWatch,
  dts: false,
  outDir: "dist",
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  onSuccess: async () => {
    copyCssAssets();
  },
});
