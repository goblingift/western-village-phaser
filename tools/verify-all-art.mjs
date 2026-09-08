// Phase 78 (final phase of the visual overhaul): the one consolidated "verify
// everything" command for the whole art pipeline. Runs all 7 verification
// scripts in this directory in sequence:
//   1. verify-asset-dimensions.mjs      (whole-PNG-file dimension sanity, every atlas)
//   2. verify-building-frames.mjs       (per-frame name/size, buildings-atlas)
//   3. verify-unit-frames.mjs           (per-frame name/size, player units/villagers/animals)
//   4. verify-raider-frames.mjs         (per-frame name/size, raiders/camps/wildlife)
//   5. verify-world-frames.mjs          (per-frame name/size, vegetation/carts/accents)
//   6. verify-resource-icon-frames.mjs  (per-frame name/size, resource icons)
//   7. verify-tileset-frames.mjs        (per-frame name/size/offset, terrain tileset's
//                                         documentation-only companion JSON - Phase 79)
//
// Deliberately a thin sequential runner (spawn each script as its own Node
// child process, exactly as `node tools/verify-X.mjs` would run it standalone)
// rather than importing/reimplementing their logic - each script already owns
// its own console output and exit code, and this way there is exactly one
// place each check's logic lives.
//
// Usage: node tools/verify-all-art.mjs   (or `npm run verify:art`)
// Exit code 0 = every check passed.
// Exit code 1 = at least one check failed (all checks still run; failures are
//   summarized at the end rather than stopping at the first failure, so a
//   single run reports the full picture).

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  'verify-asset-dimensions.mjs',
  'verify-building-frames.mjs',
  'verify-unit-frames.mjs',
  'verify-raider-frames.mjs',
  'verify-world-frames.mjs',
  'verify-resource-icon-frames.mjs',
  'verify-tileset-frames.mjs',
];

function main() {
  const results = [];

  for (const scriptName of CHECKS) {
    const scriptPath = join(__dirname, scriptName);
    console.log(`\n===== ${scriptName} =====`);
    const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
    const passed = result.status === 0;
    results.push({ scriptName, passed });
  }

  console.log('\n===== Art pipeline verification summary =====');
  for (const { scriptName, passed } of results) {
    console.log(`${passed ? '[PASS]' : '[FAIL]'} ${scriptName}`);
  }

  const failedCount = results.filter((r) => !r.passed).length;
  if (failedCount > 0) {
    console.error(`\n${failedCount}/${results.length} check(s) FAILED.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} art pipeline checks passed.`);
}

main();
