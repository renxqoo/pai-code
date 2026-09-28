import { describe, expect, test } from 'bun:test';

import { createPairingGate, type PairingDeps } from '../pairing';

function makeDeps(over: Partial<PairingDeps> = {}): PairingDeps & { tokens: Map<string, string> } {
  const tokens = new Map<string, string>();
  return {
    now: () => 1_000_000,
    persistToken: (token, device) => tokens.set(token, device),
    knownTokens: () => tokens,
    ...over,
  };
}

describe('配对面', () => {
  test('签发 → 校验成功 → 令牌可鉴权', () => {
    const deps = makeDeps();
    const gate = createPairingGate(deps);
    const code = gate.issueCode();
    const result = gate.pair(code.code, 'iPhone');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(gate.authenticate(result.token)).toBe('iPhone');
    }
    // 码一次性：再消费拒
    const again = gate.pair(code.code, 'iPad');
    expect(again.ok).toBe(false);
  });

  test('过期码拒（TTL 5min）', () => {
    let now = 1_000_000;
    const deps = makeDeps({ now: () => now });
    const gate = createPairingGate(deps);
    const code = gate.issueCode();
    now += 5 * 60 * 1000 + 1;
    expect(gate.pair(code.code, 'x').ok).toBe(false);
  });

  test('5 次错码锁定 5min（期间正确码也拒）', () => {
    let now = 1_000_000;
    const deps = makeDeps({ now: () => now });
    const gate = createPairingGate(deps);
    const code = gate.issueCode();
    for (let i = 0; i < 4; i += 1) {
      expect(gate.pair('000000', 'x')).toEqual({ ok: false, reason: 'code_mismatch' });
    }
    const fifth = gate.pair('000000', 'x');
    expect(fifth).toEqual({ ok: false, reason: 'code_mismatch' });
    // 锁定生效
    const locked = gate.pair(code.code, 'x');
    expect(locked).toEqual({ ok: false, reason: 'locked' });
    now += 5 * 60 * 1000 + 1;
    // 锁过期但原码已被清除（锁定即作废）→ 需新码
    expect(gate.pair(code.code, 'x').ok).toBe(false);
    const fresh = gate.issueCode();
    expect(gate.pair(fresh.code, 'y').ok).toBe(true);
  });

  test('鉴权：未知令牌 null；撤销（持久层删行）后失效', () => {
    const tokens = new Map<string, string>();
    const gate = createPairingGate({
      now: () => 1_000_000,
      persistToken: (token, device) => tokens.set(token, device),
      knownTokens: () => tokens,
    });
    expect(gate.authenticate('nope')).toBeNull();
    const code = gate.issueCode();
    const result = gate.pair(code.code, 'iPhone');
    if (!result.ok) throw new Error('unreachable');
    tokens.delete(result.token);
    expect(gate.authenticate(result.token)).toBeNull();
  });

  test('currentCode：消费后 null；过期后 null', () => {
    let now = 1_000_000;
    const deps = makeDeps({ now: () => now });
    const gate = createPairingGate(deps);
    expect(gate.currentCode()).toBeNull();
    const code = gate.issueCode();
    expect(gate.currentCode()?.code).toBe(code.code);
    now += 5 * 60 * 1000 + 1;
    expect(gate.currentCode()).toBeNull();
  });
});
