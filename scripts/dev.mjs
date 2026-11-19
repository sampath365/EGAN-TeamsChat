// Runs the API and the Vite dev server together with one command.
import { spawn } from 'node:child_process';

const procs = [];
function run(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  const tag = `[${name}]`;
  child.stdout.on('data', (d) => process.stdout.write(String(d).split('\n').filter(Boolean).map((l) => `${tag} ${l}\n`).join('')));
  child.stderr.on('data', (d) => process.stderr.write(String(d).split('\n').filter(Boolean).map((l) => `${tag} ${l}\n`).join('')));
  child.on('exit', (code) => {
    if (code !== 0) console.error(`${tag} exited with code ${code}`);
  });
  procs.push(child);
  return child;
}

run('api', process.execPath, ['server/index.mjs'], { PORT: process.env.API_PORT || '4100' });
run('web', process.execPath, ['node_modules/vite/bin/vite.js', '--port', process.env.PORT || '12000']);

const shutdown = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
