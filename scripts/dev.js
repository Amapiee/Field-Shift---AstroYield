// Keep the development command usable in cmd, PowerShell and POSIX shells.
const { spawn } = require("node:child_process");
const path = require("node:path");

const child = spawn(process.execPath, ["--watch", path.join(__dirname, "../server.js")], {
  env: { ...process.env, DEBUG: process.env.DEBUG || "1" },
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
