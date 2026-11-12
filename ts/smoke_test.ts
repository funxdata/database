/**
 * 冒烟测试：通过 Deno FFI 直连 database 动态库，覆盖 5 个导出功能与关键校验。
 *
 * 运行（在 ts/ 目录下）：
 *   cargo build --release
 *   cd ts && deno task smoke
 */

import { call, callOk, LIB_PATH } from "./client.ts";

const PATH = `smoke_${Date.now()}`;
const TABLE = "smoke_users";

interface CaseResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

const results: CaseResult[] = [];

function run(name: string, fn: () => string): void {
  const start = performance.now();
  try {
    const detail = fn();
    const ms = performance.now() - start;
    results.push({ name, ok: true, ms, detail });
    console.log(`PASS ${name} (${ms.toFixed(2)}ms) - ${detail}`);
  } catch (error) {
    const ms = performance.now() - start;
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, ms, detail });
    console.log(`FAIL ${name} (${ms.toFixed(2)}ms) - ${detail}`);
  }
}

function expectCode(
  symbol: Parameters<typeof call>[0],
  body: unknown,
  code: number,
): string {
  const res = call(symbol, body);
  if (res.code !== code) {
    throw new Error(`expected code ${code}, got ${res.code}: ${res.msg}`);
  }
  return `code=${res.code}`;
}

console.log("library:", LIB_PATH);
console.log("database:", PATH);

run("db_create", () => {
  const res = call("db_create", {
    path: PATH,
    table: TABLE,
    schema: "id INTEGER PRIMARY KEY, name TEXT, age INTEGER",
  });
  if (res.code !== 200) throw new Error(`unexpected code: ${res.code}`);
  return "普通表创建成功";
});

run("db_insert", () => {
  callOk("db_insert", {
    path: PATH,
    sql: `INSERT INTO ${TABLE} (id, name, age) VALUES
      (1, '张三', 20), (2, 'tom', 30), (3, 'jerry', 40)`,
  });
  return "3 行插入成功（含 Unicode）";
});

run("db_query", () => {
  const rows = callOk<Array<Record<string, unknown>>>("db_query", {
    path: PATH,
    sql: `SELECT id, name, age FROM ${TABLE} ORDER BY id`,
  });
  if (rows.length !== 3) throw new Error(`expected 3 rows, got ${rows.length}`);
  if (rows[0].name !== "张三" || rows[0].age !== 20) {
    throw new Error(`unexpected row: ${JSON.stringify(rows[0])}`);
  }
  return `读取 ${rows.length} 行，字段与类型正确`;
});

run("db_update", () => {
  callOk("db_update", {
    path: PATH,
    sql: `UPDATE ${TABLE} SET age = 21 WHERE id = 1`,
  });
  const rows = callOk<Array<Record<string, unknown>>>("db_query", {
    path: PATH,
    sql: `SELECT age FROM ${TABLE} WHERE id = 1`,
  });
  if (rows[0].age !== 21) throw new Error(`unexpected age: ${rows[0].age}`);
  return "更新后回查一致";
});

run("db_delete", () => {
  callOk("db_delete", {
    path: PATH,
    sql: `DELETE FROM ${TABLE} WHERE id = 3`,
  });
  const rows = callOk<Array<Record<string, unknown>>>("db_query", {
    path: PATH,
    sql: `SELECT id FROM ${TABLE} ORDER BY id`,
  });
  if (rows.length !== 2) throw new Error(`expected 2 rows, got ${rows.length}`);
  return "删除后剩余 2 行";
});

run("missing table validation", () => {
  return expectCode("db_create", { path: PATH }, 400102);
});

run("invalid database name", () => {
  return expectCode(
    "db_create",
    { path: "../escape", table: "escape", schema: "id INTEGER PRIMARY KEY" },
    500100,
  );
});

run("invalid table name", () => {
  return expectCode(
    "db_create",
    { path: PATH, table: "bad name", schema: "id INTEGER PRIMARY KEY" },
    500101,
  );
});

const failed = results.filter((r) => !r.ok);
console.log(
  `\nSummary: ${
    results.length - failed.length
  } passed, ${failed.length} failed`,
);

for (const suffix of ["", "-wal", "-shm"]) {
  try {
    await Deno.remove(`./database/${PATH}.db${suffix}`);
  } catch {
    // 文件可能不存在
  }
}

try {
  await Deno.remove("./database");
} catch {
  // 目录不存在或非空
}

if (failed.length > 0) {
  Deno.exit(1);
}
