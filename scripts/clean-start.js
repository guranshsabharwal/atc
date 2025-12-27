#!/usr/bin/env node
const { execSync, spawn } = require('child_process');

console.log('🧹 Cleaning up ports 3000, 3001, 3002...');

try {
    // Find PIDs using ports 3000, 3001, 3002
    // lsof -ti:3000,3001,3002 outputs PIDs
    const pids = execSync('lsof -ti:3000,3001,3002').toString().trim();

    if (pids) {
        console.log(`Killing PIDs: ${pids.replace(/\n/g, ', ')}`);
        execSync(`kill -9 ${pids.split('\n').join(' ')}`);
        console.log('✅ Ports freed.');
    } else {
        console.log('✅ Ports were already free.');
    }
} catch (error) {
    // If lsof fails (exit code 1), it usually means no processes were found, which is good.
    if (error.status === 1) {
        console.log('✅ Ports were already free (no process found).');
    } else {
        // Other error
        console.warn('⚠️  Warning during cleanup:', error.message);
    }
}

console.log('🚀 Starting Turbo pipeline...');
const turboPath = require('path').resolve(__dirname, '../node_modules/.bin/turbo');
// Quote the path or use shell: false (but we want parallel output)
// Actually, if we use shell:true, we must escape spaces.
const safeTurboPath = `"${turboPath}"`;
const dev = spawn(safeTurboPath, ['run', 'dev', '--parallel'], { stdio: 'inherit', shell: true });

dev.on('close', (code) => {
    process.exit(code);
});
