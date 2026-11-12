/**
 * Deno FFI 测试：直接调用 database 动态库，不经过 HTTP。
 *
 * 运行（在 ts/ 目录下）：deno task test
 */

import { call, callOk, close, LIB_PATH } from "./client.ts";

const PATH = `ffi_test_${Date.now()}`;
const TABLE = "users";
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

function queryRows(): Array<Record<string, unknown>> {
  return callOk<Array<Record<string, unknown>>>("db_query", {
    path: PATH,
    sql: `SELECT id, name, age FROM ${TABLE} ORDER BY id`,
  });
}

console.log("library:", LIB_PATH);
console.log("database:", PATH);

check("create table", () => {
  callOk("db_create", {
    path: PATH,
    table: TABLE,
    schema: "id INTEGER PRIMARY KEY, name TEXT, age INTEGER",
  });
});

check("insert row", () => {
  callOk("db_insert", {
    path: PATH,
    sql: `INSERT INTO ${TABLE} (id, name, age) VALUES (1, 'tom', 18)`,
  });
});

check("query row", () => {
  const rows = queryRows();
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
  if (rows[0].name !== "tom") {
    throw new Error(`unexpected name: ${rows[0].name}`);
  }
});

check("update row", () => {
  callOk("db_update", {
    path: PATH,
    sql: `UPDATE ${TABLE} SET age = 19 WHERE id = 1`,
  });
  const rows = queryRows();
  if (rows[0].age !== 19) throw new Error(`unexpected age: ${rows[0].age}`);
});

check("delete row", () => {
  callOk("db_delete", {
    path: PATH,
    sql: `DELETE FROM ${TABLE} WHERE id = 1`,
  });
  const rows = queryRows();
  if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
});

check("validation error", () => {
  const res = call("db_create", { path: PATH });
  if (res.code !== 400102) throw new Error(`unexpected code: ${res.code}`);
});

check("invalid database name", () => {
  const res = call("db_create", {
    path: "../escape",
    table: "escape",
    schema: "id INTEGER PRIMARY KEY",
  });
  if (res.code !== 500100) throw new Error(`unexpected code: ${res.code}`);
});

check("invalid table name", () => {
  const res = call("db_create", {
    path: PATH,
    table: "bad name",
    schema: "id INTEGER PRIMARY KEY",
  });
  if (res.code !== 500101) throw new Error(`unexpected code: ${res.code}`);
});

check("overflow returns non-zero", () => {
  try {
    call("db_query", { path: PATH, sql: `SELECT * FROM ${TABLE}` }, {
      bufferSize: 1,
    });
    throw new Error("expected FFI error for 1-byte buffer");
  } catch (error) {
    if (
      error instanceof Error && error.message.includes("expected FFI error")
    ) {
      throw error;
    }
  }
});

close();

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
  // 目录不存在或非空（例如同时运行了示例脚本）
}

if (failures.length > 0) {
  console.error(`\n${failures.length} test(s) failed: ${failures.join(", ")}`);
  Deno.exit(1);
}

console.log("\nAll FFI tests passed.");
