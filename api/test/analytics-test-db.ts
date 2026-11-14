import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';

export function analyticsTestClient() {
  const url = new URL(process.env.ANALYTICS_TEST_DATABASE_URL ?? '');
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/ewap_analytics_test' ||
    url.username !== 'analytics_owner' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Analytics integration tests require the dedicated loopback ewap_analytics_test database',
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href, ssl: false }),
  });
}
