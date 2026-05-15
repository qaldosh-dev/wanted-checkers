import { spawn } from "node:child_process";

const commands = [
  ["backend", "node", ["backend/src/server.js"]],
  ["frontend", "next", ["dev", "frontend"]]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    env: process.env,
    shell: true,
    stdio: ["inherit", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
