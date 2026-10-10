/**
 * jest 视角的 @x3code/relay-protocol：协议全量（core）+ 确定性 crypto 替身。
 * @noble 纯 ESM 在 Jest 29 CJS 运行时拒载；真加密等价性由 bun 侧
 * packages/relay-protocol wire-parity（RFC 7748/8032/5869/NIST-GCM 对拍）背书。
 */
export * from '../../../../packages/relay-protocol/src/core';
export * from './relay-crypto-stub';
