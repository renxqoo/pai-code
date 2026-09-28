/**
 * 配对面（T57 §4）：6 位码生成/校验/TTL；令牌签发与鉴权。
 * 安全基线：码一次性、TTL 5min、5 次失败锁 5min；令牌 32B 随机 hex、
 * 常量时间比较；令牌持久化由装配层注入（settings.json mobileTokens——
 * 撤销 = 删行，已连接会话即时断）。
 */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { BRIDGE_PAIR_CODE_TTL_MS, BRIDGE_PAIR_LOCKOUT_MS, BRIDGE_PAIR_MAX_ATTEMPTS } from '@paiapp/contracts';

export interface PairingDeps {
  now(): number;
  /** 令牌持久化（签发后落盘；撤销面在装配层）。 */
  persistToken(token: string, deviceName: string): void;
  /** 已知令牌集（鉴权查询；含 deviceName 供会话展示）。 */
  knownTokens(): ReadonlyMap<string, string>;
}

export interface PairingCode {
  code: string;
  expiresAt: number;
  consumed: boolean;
}

export interface PairingGate {
  /** 生成新配对码（桌面 UI 展示）。 */
  issueCode(): PairingCode;
  /** 当前有效码（未过期未消费；UI 轮询展示）。 */
  currentCode(): PairingCode | null;
  /** 校验配对码：成功签发令牌；失败计数（超限锁定）。 */
  pair(code: string, deviceName: string): { ok: true; token: string } | { ok: false; reason: string };
  /** 令牌鉴权（返回设备名；未知令牌 null）。 */
  authenticate(token: string): string | null;
  /** 锁定态观测（UI 展示「已锁定，请稍后再试」）。 */
  lockedUntil(): number;
}

export function createPairingGate(deps: PairingDeps): PairingGate {
  let active: PairingCode | null = null;
  let failures = 0;
  let lockedUntil = 0;

  const issueCode = (): PairingCode => {
    let code = '';
    for (let i = 0; i < 6; i += 1) code += String(randomInt(0, 10));
    active = { code, expiresAt: deps.now() + BRIDGE_PAIR_CODE_TTL_MS, consumed: false };
    return active;
  };

  return {
    issueCode,
    currentCode: () => {
      if (active === null || active.consumed || deps.now() > active.expiresAt) return null;
      return active;
    },
    pair(code, deviceName) {
      const now = deps.now();
      if (now < lockedUntil) return { ok: false, reason: 'locked' };
      if (active === null || active.consumed || now > active.expiresAt) return { ok: false, reason: 'code_expired' };
      if (code !== active.code) {
        failures += 1;
        if (failures >= BRIDGE_PAIR_MAX_ATTEMPTS) {
          lockedUntil = now + BRIDGE_PAIR_LOCKOUT_MS;
          failures = 0;
          active = null;
        }
        return { ok: false, reason: 'code_mismatch' };
      }
      active.consumed = true;
      const token = randomBytes(32).toString('hex');
      deps.persistToken(token, deviceName);
      return { ok: true, token };
    },
    authenticate(token) {
      const known = deps.knownTokens();
      // 常量时间比较循环（令牌量小；每枚与候选比较的耗时一致）
      let matched: string | null = null;
      for (const [candidate, device] of known) {
        if (candidate.length !== token.length) continue;
        if (timingSafeEqual(Buffer.from(candidate), Buffer.from(token))) matched = device;
      }
      return matched;
    },
    lockedUntil: () => lockedUntil,
  };
}
