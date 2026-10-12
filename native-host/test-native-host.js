import { spawn } from 'child_process';

const child = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  env: process.env
});

// Keep stdin open by not ending it
process.stdin.resume();

// Prevent the test script from exiting
process.stdin.resume();

// Handle shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[Test] Shutting down...');
  process.exit(0);
});

// Keep the process alive
setInterval(() => {}, 1000);
