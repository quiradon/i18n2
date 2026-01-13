const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packagePath = path.join(rootDir, 'package.json');

const raw = fs.readFileSync(packagePath, 'utf8');
const pkg = JSON.parse(raw);
const version = String(pkg.version || '');
const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);

if (!match) {
  console.error(`[version] Unsupported version format: ${version}`);
  process.exit(1);
}

const major = match[1];
const minor = match[2];
const patch = Number.parseInt(match[3], 10) + 1;
const nextVersion = `${major}.${minor}.${patch}`;

if (nextVersion !== version) {
  pkg.version = nextVersion;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[version] bumped to ${nextVersion}`);
}
