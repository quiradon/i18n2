const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const gitDir = path.join(rootDir, '.git');

if (!fs.existsSync(gitDir)) {
  process.exit(0);
}

try {
  execSync('git config core.hooksPath .githooks', {
    cwd: rootDir,
    stdio: 'ignore'
  });
} catch {
  process.exit(0);
}
