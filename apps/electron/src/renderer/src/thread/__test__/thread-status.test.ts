import { describe, expect, test } from 'bun:test';

import { threadStatus } from '../thread-status';

/** 状态优先级表：permission > compacting > running > queued > idle（含组合态）。 */
describe('threadStatus', () => {
  test.each([
    [{ permissionWaiting: false, compacting: false, generating: false, queueCount: 0 }, 'idle'],
    [{ permissionWaiting: false, compacting: false, generating: true, queueCount: 0 }, 'running'],
    [{ permissionWaiting: false, compacting: false, generating: true, queueCount: 3 }, 'running'],
    [{ permissionWaiting: false, compacting: true, generating: true, queueCount: 1 }, 'compacting'],
    [{ permissionWaiting: true, compacting: true, generating: true, queueCount: 2 }, 'permission'],
    [{ permissionWaiting: true, compacting: false, generating: false, queueCount: 0 }, 'permission'],
    [{ permissionWaiting: false, compacting: false, generating: false, queueCount: 1 }, 'queued'],
  ])('%j → %s', (input, expected) => {
    expect(threadStatus(input)).toBe(expected);
  });
});
