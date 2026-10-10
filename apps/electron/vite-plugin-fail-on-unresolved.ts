import type { Plugin } from 'vite';

/**
 * 未解析导入守门：vite 对构建图里解析不到的导入不失败也不告警，而是生成一个
 * 「模块求值即 throw」的桩（Could not resolve "x" imported by "y". Is it installed?）
 * 打进产物——运行时一加载就崩，构建门禁全程假绿。本插件在产物落盘前扫描全部
 * chunk，发现这种桩直接让构建失败，把崩溃提前到门禁阶段。
 */

/** vite 未解析导入桩的 throw 文案（specifier/importer 为捕获组） */
const UNRESOLVED_IMPORT_STUB =
  /Could not resolve "([^"]+)" imported by "([^"]+)"\. Is it installed\?/g;

interface UnresolvedImportStub {
  specifier: string;
  importer: string;
}

/** 扫描产物代码里的未解析导入桩；干净代码返回空数组 */
function findUnresolvedImportStubs(code: string): UnresolvedImportStub[] {
  return [...code.matchAll(UNRESOLVED_IMPORT_STUB)].map((match) => ({
    specifier: match[1] ?? '',
    importer: match[2] ?? '',
  }));
}

function failOnUnresolvedImportsPlugin(): Plugin {
  return {
    name: 'x3code:fail-on-unresolved-imports',
    apply: 'build',
    generateBundle(_, bundle) {
      const stubs: string[] = [];
      for (const [fileName, entry] of Object.entries(bundle)) {
        if (entry.type !== 'chunk') continue;
        for (const stub of findUnresolvedImportStubs(entry.code)) {
          stubs.push(`  ${fileName}: "${stub.specifier}" imported by "${stub.importer}"`);
        }
      }
      if (stubs.length > 0) {
        this.error(
          `unresolved imports became throwing stubs in output (install them or eliminate the import at build time):\n${stubs.join('\n')}`,
        );
      }
    },
  };
}

export { failOnUnresolvedImportsPlugin, findUnresolvedImportStubs };
