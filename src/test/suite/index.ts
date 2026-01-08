import * as fs from 'fs';
import * as path from 'path';
import * as Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = __dirname;
  const files = fs
    .readdirSync(testsRoot)
    .filter(file => file.endsWith('.test.js'))
    .map(file => path.join(testsRoot, file));

  files.forEach(file => mocha.addFile(file));

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
