import { spawn } from 'node:child_process';

const children = ['server', 'client'].map((workspace) => {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'dev', '--workspace', workspace], { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => { if (code && !stopping) stop(); });
  return child;
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
