import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsTestClient } from './analytics-test-db.js';

describe('Analytics database safety guard', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    'postgresql://analytics_owner:unused@remote.example/ewap_analytics_test',
    'postgresql://analytics_owner:unused@127.0.0.1/production',
    'postgresql://application_user:unused@127.0.0.1/ewap_analytics_test',
    'https://analytics_owner:unused@127.0.0.1/ewap_analytics_test',
    'postgresql://analytics_owner:unused@127.0.0.1/ewap_analytics_test?host=remote.example',
    'postgresql://analytics_owner:unused@127.0.0.1/ewap_analytics_test#unexpected',
  ])(
    'rejects unsafe test target %# before creating a database client',
    (url) => {
      vi.stubEnv('ANALYTICS_TEST_DATABASE_URL', url);
      expect(() => analyticsTestClient()).toThrow('dedicated loopback');
    },
  );
});
