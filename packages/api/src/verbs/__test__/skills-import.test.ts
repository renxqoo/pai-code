import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs/promises";

import type { ApiError, SkillCandidateView, SkillInspectedCandidate, SkillView } from "@paiapp/contracts";

import {
  combineCandidate,
  discoverSkillDirs,
  isInstallableSkillName,
  isPathInside,
  mapSkillInspectError,
  mapSkillInstallError,
  planImport,
  skillProblemKind,
  type ScanFs,
} from "../skills-import";

/** T42 M1：映射表完备性（hub 七问题码逐码 + 未知码兜底）、目标名围栏、导入计划、
 *  两深度候选发现。判定规则**不在 app**（hub skills/inspect 单一判定源）——本套件
 *  不含任何装载器规则镜像用例。 */

// ---------------------------------------------------------------- 映射表

const PROBLEM_TABLE: Array<[string, string]> = [
  ["not_found", "skill_source_invalid"],
  ["unreadable", "skill_invalid"],
  ["not_regular_file", "skill_invalid"],
  ["too_large", "skill_invalid"],
  ["no_frontmatter", "skill_invalid"],
  ["frontmatter_not_flat", "skill_invalid"],
  ["missing_fields", "skill_invalid"],
  ["future_problem_code", "skill_invalid"], // 未知码兜底
];

for (const [problem, kind] of PROBLEM_TABLE) {
  test(`问题码映射：${problem} → ${kind}`, () => {
    expect(skillProblemKind(problem)).toBe(kind);
  });
}

const INSTALL_ERROR_TABLE: Array<[ApiError, string]> = [
  [{ kind: "name_conflict", message: "skill already installed: x" }, "skill_exists"],
  [{ kind: "io_failed", message: "rename failed" }, "skill_write_failed"],
  [{ kind: "internal", message: "name rewrite failed" }, "skill_write_failed"],
  [{ kind: "state_conflict", message: "skills root not effective" }, "skill_write_failed"],
  [{ kind: "unknown_command", message: "unknown command" }, "skill_not_supported"],
  [{ kind: "unregistered_code", code: "new_code", message: "m" }, "skill_not_supported"],
  // invalid_input 分诊（报文 token 匹配 hub skills-install.ts 的铸造形态）
  [{ kind: "invalid_input", message: "invalid skill source: frontmatter_not_flat: /a/b" }, "skill_invalid"],
  [{ kind: "invalid_input", message: "invalid skill source: missing_fields: /a/b" }, "skill_invalid"],
  [{ kind: "invalid_input", message: "invalid skill source: too_large: /a/b" }, "skill_invalid"],
  [{ kind: "invalid_input", message: "invalid skill source: not_found: /a/b" }, "skill_source_invalid"],
  [{ kind: "invalid_input", message: "invalid skill name: ../x" }, "skill_name_invalid"],
  [{ kind: "invalid_input", message: "skill source too large: more than 2000 entries" }, "skill_source_invalid"],
  [{ kind: "invalid_input", message: "skill source is already the install target: /a/b" }, "skill_source_invalid"],
  [{ kind: "invalid_input", message: "invalid skill source: /not/a/dir" }, "skill_source_invalid"],
  // 原样透传族（transient 不折平 face；其余 hub 码不篡改）
  [{ kind: "transient", face: "host_unavailable" }, "transient"],
  [{ kind: "transient", face: "timeout", message: "t" }, "transient"],
  [{ kind: "trust_required", message: "m" }, "trust_required"],
];

for (const [error, kind] of INSTALL_ERROR_TABLE) {
  test(`install 错误映射：${error.kind}${"message" in error ? `(${error.message.slice(0, 28)})` : ""} → ${kind}`, () => {
    const mapped = mapSkillInstallError(error);
    expect(mapped.kind).toBe(kind);
  });
}

test("transient 透传保留 face 与 message", () => {
  const error: ApiError = { kind: "transient", face: "timeout", message: "boom" };
  expect(mapSkillInstallError(error)).toEqual(error);
});

test("inspect 错误映射：缺命令降级 skill_not_supported，其余原样", () => {
  expect(mapSkillInspectError({ kind: "unknown_command", message: "m" }).kind).toBe("skill_not_supported");
  expect(mapSkillInspectError({ kind: "invalid_input", message: "m" }).kind).toBe("invalid_input");
  expect(mapSkillInspectError({ kind: "transient", face: "busy" }).kind).toBe("transient");
});

// ---------------------------------------------------------------- 围栏

const NAME_TABLE: Array<[string, boolean]> = [
  ["a", true],
  ["tavily-cli", true],
  ["rxopen.tool_v2", true],
  ["A".repeat(64), true],
  ["", false],
  [".", false],
  ["..", false],
  ["../x", false],
  ["a/b", false],
  ["a\\b", false],
  ["-lead", false],
  [".lead", false],
  ["A".repeat(65), false],
  ["含中文", false],
  ["sp ace", false],
];

for (const [name, ok] of NAME_TABLE) {
  test(`目标名围栏：${JSON.stringify(name)} → ${ok ? "过" : "拒"}`, () => {
    expect(isInstallableSkillName(name)).toBe(ok);
  });
}

// ---------------------------------------------------------------- 计划

const candidate = (over: Partial<SkillCandidateView>): SkillCandidateView => ({
  name: "bw",
  description: "d",
  sourcePath: "/src/bw",
  origin: "agents",
  state: "ready",
  problem: null,
  ...over,
});

test("计划：缺省目标名 = 候选建议名；overwrite 透传", () => {
  const planned = planImport({ candidate: candidate({}), overwrite: false, installed: [] });
  expect(planned).toEqual({ ok: true, plan: { sourcePath: "/src/bw", name: "bw", overwrite: false } });
});

test("计划：显式改名 → 目标名 = 显式名（副本 name 行由 hub 改写）", () => {
  const planned = planImport({
    candidate: candidate({ sourcePath: "/src/tavily", state: "rename", name: "tavily-cli", problem: "name_mismatch" }),
    name: "tavily-tool",
    overwrite: false,
    installed: [],
  });
  expect(planned).toEqual({ ok: true, plan: { sourcePath: "/src/tavily", name: "tavily-tool", overwrite: false } });
});

const PLAN_FAIL_TABLE: Array<[string, Parameters<typeof planImport>[0], string]> = [
  [
    "blocked 候选 → 问题码对应 kind",
    { candidate: candidate({ state: "blocked", name: "x", problem: "frontmatter_not_flat" }), overwrite: false, installed: [] },
    "skill_invalid",
  ],
  [
    "blocked + not_found → skill_source_invalid",
    { candidate: candidate({ state: "blocked", problem: "not_found" }), overwrite: false, installed: [] },
    "skill_source_invalid",
  ],
  [
    "目标名不过围栏 → skill_name_invalid",
    { candidate: candidate({}), name: "../x", overwrite: false, installed: [] },
    "skill_name_invalid",
  ],
  [
    "同名已装未 overwrite → skill_exists",
    { candidate: candidate({}), overwrite: false, installed: [{ name: "bw", enabled: true, source: "user" }] },
    "skill_exists",
  ],
  [
    "同名 project 级不算冲突（hub 语义：目标只在 user 根）",
    { candidate: candidate({}), overwrite: true, installed: [{ name: "bw", enabled: true, source: "project" }] },
    "",
  ],
];

for (const [name, input, kind] of PLAN_FAIL_TABLE) {
  test(`计划：${name}`, () => {
    const planned = planImport(input);
    if (kind === "") {
      expect(planned.ok).toBe(true);
      return;
    }
    expect(planned.ok).toBe(false);
    if (!planned.ok) expect(planned.error.kind).toBe(kind);
  });
}

test("计划：冲突 + overwrite → 放行（hub 备份回滚换入）", () => {
  const installed: SkillView[] = [{ name: "bw", enabled: true, source: "user" }];
  const planned = planImport({ candidate: candidate({}), overwrite: true, installed });
  expect(planned).toEqual({ ok: true, plan: { sourcePath: "/src/bw", name: "bw", overwrite: true } });
});

// ---------------------------------------------------------------- combine

test("combine：ready/rename/blocked 三态拼装（blocked 回退名 = 源目录名）", () => {
  const ready: SkillInspectedCandidate = { sourcePath: "/r/bw", state: "ready", name: "bw", description: "d" };
  const rename: SkillInspectedCandidate = { sourcePath: "/r/tavily", state: "rename", name: "tavily-cli", description: "d2" };
  const blocked: SkillInspectedCandidate = { sourcePath: "/r/demo-orders", state: "blocked", problem: "frontmatter_not_flat" };
  expect(combineCandidate(ready, "pi")).toEqual({
    name: "bw", description: "d", sourcePath: "/r/bw", origin: "pi", state: "ready", problem: null,
  });
  expect(combineCandidate(rename, "claude")).toEqual({
    name: "tavily-cli", description: "d2", sourcePath: "/r/tavily", origin: "claude", state: "rename", problem: "name_mismatch",
  });
  expect(combineCandidate(blocked, "agents")).toEqual({
    name: "demo-orders", description: "", sourcePath: "/r/demo-orders", origin: "agents", state: "blocked", problem: "frontmatter_not_flat",
  });
});

// ---------------------------------------------------------------- 路径包含

test("isPathInside：等值/下级在内，前缀兄弟在外", () => {
  expect(isPathInside("/home/u/.agents/skills", "/home/u/.agents/skills")).toBe(true);
  expect(isPathInside("/home/u/.agents/skills", "/home/u/.agents/skills/a/b")).toBe(true);
  expect(isPathInside("/home/u/.agents/skills", "/home/u/.agents/skills-secret")).toBe(false);
  expect(isPathInside("/home/u/.agents/skills", "/home/u/.ssh")).toBe(false);
  expect(isPathInside("/", "/any")).toBe(true);
});

// ---------------------------------------------------------------- 发现（真实 fs 夹具）

const scanFs: ScanFs = {
  readdir: (path, options) => fs.readdir(path, options),
  stat: (path) => fs.stat(path),
};

async function fixture(build: (root: string) => Promise<void>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pai-scan-"));
  await build(root);
  return root;
}

test("发现：深度 1 候选 + 深度 2 嵌套拍平 + 无 SKILL.md 目录忽略 + 隐藏跳过（§9 真实四类拒因形态）", async () => {
  const root = await fixture(async (base) => {
    // 深度 1：bw（可解析技能形态）
    await mkdir(join(base, "bw"));
    await writeFile(join(base, "bw", "SKILL.md"), "---\nname: bw\ndescription: d\n---\nbody");
    // 嵌套拍平：@user_4998424d/rxopen-hot（T42 §0 真实嵌套形态）
    await mkdir(join(base, "@user_4998424d", "rxopen-hot"), { recursive: true });
    await writeFile(join(base, "@user_4998424d", "rxopen-hot", "SKILL.md"), "---\nname: rxopen-hot\ndescription: d\n---\n");
    // 无 SKILL.md（.rxcli-sync-manifests 形态）：忽略，且不下探
    await mkdir(join(base, ".rxcli-sync-manifests", "inner"), { recursive: true });
    await mkdir(join(base, "empty-dir"));
    await writeFile(join(base, "empty-dir", "notes.md"), "x");
  });
  try {
    const found = await discoverSkillDirs(scanFs, root, "agents");
    expect(found.map((f) => f.sourcePath).sort()).toEqual(
      [join(root, "@user_4998424d", "rxopen-hot"), join(root, "bw")].sort(),
    );
    expect(found.every((f) => f.origin === "agents")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("发现：隐藏目录跳过（含隐藏深度 2）", async () => {
  const root = await fixture(async (base) => {
    await mkdir(join(base, ".hidden"), { recursive: true });
    await writeFile(join(base, ".hidden", "SKILL.md"), "---\nname: x\ndescription: d\n---\n");
    await mkdir(join(base, "wrap", ".deep"), { recursive: true });
    await writeFile(join(base, "wrap", ".deep", "SKILL.md"), "---\nname: y\ndescription: d\n---\n");
  });
  try {
    expect(await discoverSkillDirs(scanFs, root, "pi")).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("发现：深度 1 带 SKILL.md 的技能不下探（捆绑 references/ 内的 SKILL.md 不是候选）", async () => {
  const root = await fixture(async (base) => {
    await mkdir(join(base, "kmark-cli", "references"), { recursive: true });
    await writeFile(join(base, "kmark-cli", "SKILL.md"), "---\nname: kmark-cli\ndescription: d\n---\n");
    await writeFile(join(base, "kmark-cli", "references", "SKILL.md"), "---\nname: inner\ndescription: d\n---\n");
  });
  try {
    const found = await discoverSkillDirs(scanFs, root, "claude");
    expect(found.map((f) => f.sourcePath)).toEqual([join(root, "kmark-cli")]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("发现：symlink 目录跟随（越界拒在白名单层）；根自身带 SKILL.md → 根即候选", async () => {
  const root = await fixture(async (base) => {
    await mkdir(join(base, "real"));
    await writeFile(join(base, "real", "SKILL.md"), "---\nname: real\ndescription: d\n---\n");
    await symlink(join(base, "real"), join(base, "link"));
    await writeFile(join(base, "SKILL.md"), "---\nname: picked-root\ndescription: d\n---\n");
  });
  try {
    // 根自身带 SKILL.md → 只报根（用户直接选中技能目录的形态）
    expect(await discoverSkillDirs(scanFs, root, "picked")).toEqual([{ sourcePath: root, origin: "picked" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const root2 = await fixture(async (base) => {
    await mkdir(join(base, "real"));
    await writeFile(join(base, "real", "SKILL.md"), "---\nname: real\ndescription: d\n---\n");
    await symlink(join(base, "real"), join(base, "link"));
  });
  try {
    const found = await discoverSkillDirs(scanFs, root2, "picked");
    expect(found.map((f) => f.sourcePath).sort()).toEqual([join(root2, "link"), join(root2, "real")].sort());
  } finally {
    await rm(root2, { recursive: true, force: true });
  }
});

test("发现：源根不存在 → 空表（首次导入的常态）", async () => {
  expect(await discoverSkillDirs(scanFs, "/nonexistent/pai/skills", "agents")).toEqual([]);
});
