import { randomBytes } from 'node:crypto';
import {
  existsSync,
  openSync,
  closeSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = resolve(root, '.env.stack-local');
const command = process.argv[2];
const base = [
  'compose',
  '--project-name',
  'ewap-local',
  '--env-file',
  envFile,
  '-f',
  resolve(root, 'compose.local.yml'),
];
function docker(args, options = {}) {
  const result = spawnSync('docker', [...base, ...args], {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Local stack command failed (exit ${result.status})`);
  return result;
}
if (command === 'init') {
  if (existsSync(envFile)) {
    const current = readFileSync(envFile, 'utf8');
    if (!/^EWAP_LOCAL_EMAIL=/m.test(current))
      appendFileSync(
        envFile,
        '\nEWAP_LOCAL_EMAIL=local-admin@example.invalid\n',
      );
    if (!/^EWAP_LOCAL_PASSWORD=/m.test(current))
      appendFileSync(
        envFile,
        `EWAP_LOCAL_PASSWORD=${randomBytes(24).toString('hex')}\n`,
      );
    console.log(
      'Existing local stack secrets retained; local login settings ensured.',
    );
    process.exit(0);
  }
  const keys = [
    'EWAP_DB_PASSWORD',
    'EWAP_BROKER_PASSWORD',
    'EWAP_JWT_SECRET',
    'EWAP_WORKER_KEY',
    'EWAP_AI_KEY',
    'EWAP_LOCAL_PASSWORD',
  ];
  writeFileSync(
    envFile,
    '# Generated local-only secrets. Never commit this file.\n' +
      keys.map((k) => `${k}=${randomBytes(32).toString('hex')}`).join('\n') +
      '\nEWAP_WEB_PORT=18080\nEWAP_TLS_PORT=18443\nEWAP_LOCAL_EMAIL=local-admin@example.invalid\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Created .env.stack-local with unique local credentials.');
} else {
  if (!existsSync(envFile))
    throw new Error('Run node scripts/local-stack.mjs init first');
  if (command === 'up') {
    // Serialize image builds to bound peak disk/memory use on developer machines.
    for (const service of ['api', 'migrate', 'worker', 'web', 'ai-service'])
      docker(['build', service]);
    docker(['up', '-d', '--wait', '--wait-timeout', '240']);
  } else if (command === 'check') docker(['config', '--quiet']);
  else if (command === 'status') docker(['ps', '-a']);
  else if (command === 'stop') docker(['stop']);
  else if (command === 'down')
    docker(['down']); // Volumes deliberately retained.
  else if (command === 'smoke')
    docker([
      'run',
      '--rm',
      '--no-deps',
      '--entrypoint',
      'node',
      '-v',
      `${resolve(root, 'scripts/local-smoke.mjs')}:/verify/local-smoke.mjs:ro`,
      'migrate',
      '/verify/local-smoke.mjs',
    ]);
  else if (command === 'account')
    docker([
      'run',
      '--rm',
      '--no-deps',
      '--entrypoint',
      'node',
      '-v',
      `${resolve(root, 'scripts/local-account.mjs')}:/verify/local-account.mjs:ro`,
      'migrate',
      '/verify/local-account.mjs',
    ]);
  else if (command === 'backup') {
    const path = resolve(process.argv[3] ?? '');
    if (!process.argv[3] || dirname(path) === path)
      throw new Error('Supply a new backup file path in an existing directory');
    const fd = openSync(path, 'wx', 0o600);
    try {
      docker(
        [
          'exec',
          '-T',
          'postgres',
          'pg_dump',
          '-U',
          'ewap_local',
          '-d',
          'ewap_local',
          '--format=custom',
        ],
        { stdio: ['ignore', fd, 'inherit'] },
      );
    } catch (error) {
      unlinkSync(path);
      throw error;
    } finally {
      closeSync(fd);
    }
    console.log(`Created local database backup: ${path}`);
  } else if (command === 'verify-backup') {
    const path = resolve(process.argv[3] ?? '');
    if (!process.argv[3] || !existsSync(path))
      throw new Error('Supply an existing backup path');
    // Restore into a separate verification database, never overwrite the application DB.
    docker([
      'exec',
      '-T',
      'postgres',
      'createdb',
      '-U',
      'ewap_local',
      'ewap_restore_check',
    ]);
    let verified = false;
    try {
      const fd = openSync(path, 'r');
      try {
        docker(
          [
            'exec',
            '-T',
            'postgres',
            'pg_restore',
            '-U',
            'ewap_local',
            '-d',
            'ewap_restore_check',
            '--exit-on-error',
            '--no-owner',
          ],
          { stdio: [fd, 'inherit', 'inherit'] },
        );
      } finally {
        closeSync(fd);
      }
      docker([
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'ewap_local',
        '-d',
        'ewap_restore_check',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'SELECT count(*) AS restored_runs FROM "WorkflowRun"; SELECT count(*) AS restored_migrations FROM "_prisma_migrations";',
      ]);
      verified = true;
    } finally {
      docker([
        'exec',
        '-T',
        'postgres',
        'dropdb',
        '-U',
        'ewap_local',
        'ewap_restore_check',
      ]);
    }
    if (verified)
      console.log(
        'Backup restored and queried in a separate temporary database.',
      );
  } else
    throw new Error(
      'Expected init, check, up, status, smoke, account, backup, verify-backup, stop, or down',
    );
}
