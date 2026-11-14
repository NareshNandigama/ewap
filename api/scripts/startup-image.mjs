import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const compose = ['compose', '-f', fileURLToPath(new URL('../../compose.api-startup.yml', import.meta.url))];
function docker(args) {
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker command failed (${result.status})`);
}
try {
  docker([...compose, 'up', '--build', '--wait', '--wait-timeout', '120']);
  docker([...compose, 'exec', '-T', 'api', 'node', '--input-type=module', '-e', `
    import { existsSync } from 'node:fs';
    if (existsSync('/app/.env') || process.env.DATABASE_URL) throw new Error('Unexpected dotenv/DATABASE_URL');
    const response = await fetch('http://127.0.0.1:3000/api/v1/health');
    if (!response.ok || (await response.json()).status !== 'ok') throw new Error('Health check failed');
    console.log('Production API image healthy using injected DB_* and no .env or DATABASE_URL');
  `]);
} finally {
  // Preserve the named synthetic database volume.
  docker([...compose, 'down']);
}
