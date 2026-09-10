import { describe, expect, test } from 'bun:test';

import { hubSpawnEnv } from '../spawn-env';

/** 回归症状：宿主 shell 的第三方渠道 key 透传 hub → pi 把内置渠道判为可用模型，
 * fork 回落链静默切到 openai/gpt-5.5。 */
describe('hubSpawnEnv', () => {
  test('drops third-party provider keys from the inherited environment', () => {
    const out = hubSpawnEnv({
      OPENAI_API_KEY: 'sk-leak',
      ANTHROPIC_AUTH_TOKEN: 'leak',
      GEMINI_API_KEY: 'leak',
      DEEPSEEK_API_KEY: 'leak',
      XAI_API_KEY: 'leak',
    });
    expect(out).toEqual({});
  });

  test('keeps process and network essentials (POSIX)', () => {
    const source = {
      PATH: '/usr/bin',
      HOME: '/home/u',
      LANG: 'en_US.UTF-8',
      LANGUAGE: 'en_US:en',
      LC_ALL: 'zh_CN.UTF-8',
      XDG_CONFIG_HOME: '/home/u/.config',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
      NO_PROXY: 'localhost',
      TMPDIR: '/tmp',
      TZ: 'Asia/Shanghai',
      SSL_CERT_FILE: '/certs/ca.pem',
      NODE_EXTRA_CA_CERTS: '/certscorp/root.pem',
      SSH_AUTH_SOCK: '/tmp/agent.sock',
    };
    expect(hubSpawnEnv(source)).toEqual(source);
  });

  test('keeps Windows essentials with their native casing (SystemRoot/windir/ComSpec)', () => {
    // Windows 环境块保留原始大小写——匹配必须不区分大小写且写出保留原名
    const source = {
      SystemRoot: 'C:\\Windows',
      SystemDrive: 'C:',
      windir: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\system32\\cmd.exe',
      ProgramFiles: 'C:\\Program Files',
      APPDATA: 'C:\\Users\\u\\AppData',
      PUBLIC: 'C:\\Users\\Public',
      OPENAI_API_KEY: 'sk-leak',
    };
    const { OPENAI_API_KEY: dropped, ...kept } = source;
    void dropped;
    expect(hubSpawnEnv(source)).toEqual(kept);
  });

  test('does not mutate the source object', () => {
    const source = { PATH: '/usr/bin', OPENAI_API_KEY: 'sk-leak' };
    const out = hubSpawnEnv(source);
    expect(out).not.toBe(source);
    expect(source.OPENAI_API_KEY).toBe('sk-leak');
    expect(out.OPENAI_API_KEY).toBeUndefined();
  });
});
