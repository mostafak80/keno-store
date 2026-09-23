const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === '.agent') continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllJsFiles(fullPath, fileList);
    } else if (/\.(?:js|mjs|cjs)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const jsFiles = getAllJsFiles('.');
console.log(`Checking syntax for ${jsFiles.length} JavaScript files...`);

let hasError = false;
for (const file of jsFiles) {
  try {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    console.log(`[PASS] ${file}`);
  } catch (err) {

    hasError = true;
    console.error(`[SYNTAX ERROR] in ${file}:`, err.message);
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('\n--- ALL JAVASCRIPT FILES HAVE VALID SYNTAX! ---');
}

