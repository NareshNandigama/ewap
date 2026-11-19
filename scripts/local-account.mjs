// Explicit local-only account setup; credentials come from the ignored Compose env.
import assert from 'node:assert/strict';
const base = 'http://gateway:8080/api/v1';
const email = process.env.LOCAL_ADMIN_EMAIL;
const password = process.env.LOCAL_ADMIN_PASSWORD;
assert.ok(
  email && password && password.length >= 12,
  'Run local-stack init first',
);
async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}
let login = await post('/auth/login', { email, password });
if (!login.ok) {
  assert.ok(
    [401, 404].includes(login.status),
    `Local login returned HTTP ${login.status}`,
  );
  await login.body?.cancel();
  const register = await post('/auth/register', {
    organizationName: 'Local development',
    name: 'Local administrator',
    email,
    password,
  });
  assert.ok(
    register.ok || register.status === 409,
    `Local registration returned HTTP ${register.status}`,
  );
  await register.body?.cancel();
  login = await post('/auth/login', { email, password });
}
assert.ok(
  login.ok,
  `Local login returned HTTP ${login.status}; check the existing account password`,
);
await login.body?.cancel();
console.log(
  `Local administrator ready: ${email}. Password is EWAP_LOCAL_PASSWORD in .env.stack-local.`,
);
