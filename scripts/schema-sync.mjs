import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const entries = [
  ['api/prisma/schema.prisma', 'worker/prisma/schema.prisma'],
  ['api/src/prisma/database-config.ts', 'worker/src/prisma/database-config.ts'],
];
for (const [source, target] of entries) {
  const contents =
    '// Generated from ' +
    source +
    '; edit the canonical API source.\n' +
    readFileSync(new URL(source, root), 'utf8');
  const destination = fileURLToPath(new URL(target, root));
  if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== contents)
      throw new Error('Stale generated file: ' + target);
  } else writeFileSync(destination, contents);
}
