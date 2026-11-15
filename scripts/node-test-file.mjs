import { execFile, spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const windows = process.platform === 'win32';
const timeoutMs = 120_000;

export function runNodeTest(file, cwd) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', file], {
      cwd,
      detached: !windows,
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    });

    let termination;
    const timer = setTimeout(() => {
      termination = new Promise((done) => {
        if (windows) {
          execFile(
            'taskkill.exe',
            ['/F', '/T', '/PID', String(child.pid)],
            { timeout: 5000, windowsHide: true },
            () => {
              child.kill('SIGKILL');
              done();
            },
          );
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if (error.code !== 'ESRCH') child.kill('SIGKILL');
          }
          done();
        }
      });
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', async (code) => {
      clearTimeout(timer);
      const seconds = Number(((performance.now() - started) / 1000).toFixed(3));
      await termination;
      const status = termination ? 'timeout' : code === 0 ? 'pass' : 'fail';
      resolve({ status, seconds });
    });
  });
}
