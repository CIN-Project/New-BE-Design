// Runs `tsup --watch` (JS/JSX rebuilds) and watch-css.js (CSS-only copies,
// which tsup's own watcher can't see — see that file's comment) side by
// side. A plain `"dev": "tsup --watch & node scripts/watch-css.js"` npm
// script would depend on the user's shell supporting `&` for
// backgrounding, which isn't reliable across cmd.exe/PowerShell/bash — this
// spawns both directly in Node instead, so `npm run dev` works the same
// everywhere.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

// One clean sweep before the watcher starts, instead of tsup.config.js's
// clean:true running on every single watch-triggered rebuild (see that
// file's comment on the overlapping-rebuild race that caused). dist/ is
// gitignored/disposable, so removing it here is safe.
rmSync("dist", { recursive: true, force: true });

const procs = [
  spawn("npx", ["tsup", "--watch"], { stdio: "inherit", shell: true }),
  spawn("node", ["scripts/watch-css.js"], { stdio: "inherit", shell: true }),
];

const shutdown = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

for (const p of procs) {
  p.on("exit", (code) => {
    if (code && code !== 0) shutdown();
  });
}
