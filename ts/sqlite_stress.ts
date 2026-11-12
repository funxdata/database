/**
 * 关系表压测：通过 Deno FFI 直连 database 动态库。
 *
 * 运行（在 ts/ 目录下）：deno task stress [all|setup|insert|insert-batch|query|query-pk|update|delete|sanity]
 *
 * 注意：Deno.dlopen 的导出函数是同步调用，因此这里是串行压测，
 * 不包含 HTTP 并发。若需要并发，请在多个进程中分别运行。
 */

import { call, close } from "./client.ts";

const PATH = "sqlstress";
const TABLE = "items";

const TOTAL = 2000;
const QUERY_ROUNDS = 200;
const BATCH_SIZE = 500;

function callChecked(symbol: Parameters<typeof call>[0], body: unknown) {
  const res = call(symbol, body);
  if (res.code !== 200) {
    throw new Error(`${symbol} failed: ${JSON.stringify(res)}`);
  }
  return res;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function stats(latencies: number[]) {
  const sum = latencies.reduce((a, b) => a + b, 0);
  return {
    count: latencies.length,
    avg: +(sum / latencies.length).toFixed(2),
    p50: +percentile(latencies, 50).toFixed(2),
    p90: +percentile(latencies, 90).toFixed(2),
    p99: +percentile(latencies, 99).toFixed(2),
    max: +Math.max(...latencies).toFixed(2),
  };
}

function idBase(): number {
  return Date.now() * 1000;
}

function setup() {
  console.log(`[setup] create table ${TABLE}`);
  callChecked("db_create", {
    path: PATH,
    table: TABLE,
    schema: "id INTEGER PRIMARY KEY, name TEXT, age INTEGER",
  });
  console.log("[setup] ok");
}

function stressInsert() {
  console.log(`\n[insert] total=${TOTAL}`);
  const latencies: number[] = [];
  const start = performance.now();
  const base = idBase();

  for (let i = 0; i < TOTAL; i++) {
    const t0 = performance.now();
    callChecked("db_insert", {
      path: PATH,
      sql: `INSERT INTO ${TABLE} (id, name, age) VALUES (${
        base + i
      }, 'user_${i}', ${i % 100})`,
    });
    latencies.push(performance.now() - t0);
  }

  const wall = performance.now() - start;
  console.log("[insert] latency(ms):", stats(latencies));
  console.log(
    `[insert] wall=${wall.toFixed(0)}ms  throughput=${
      ((TOTAL / wall) * 1000).toFixed(0)
    } ops/s`,
  );
}

function stressInsertBatch() {
  console.log(`\n[insert-batch] total=${TOTAL} batch=${BATCH_SIZE}`);
  const latencies: number[] = [];
  const start = performance.now();
  const base = idBase();

  for (let off = 0; off < TOTAL; off += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, TOTAL - off);
    const values = Array.from(
      { length: count },
      (_, i) => `(${base + off + i}, 'user_${off + i}', ${i % 100})`,
    ).join(",");
    const t0 = performance.now();
    callChecked("db_insert", {
      path: PATH,
      sql: `INSERT INTO ${TABLE} (id, name, age) VALUES ${values}`,
    });
    latencies.push(performance.now() - t0);
  }

  const wall = performance.now() - start;
  console.log("[insert-batch] batch latency(ms):", stats(latencies));
  console.log(
    `[insert-batch] wall=${wall.toFixed(0)}ms  throughput=${
      ((TOTAL / wall) * 1000).toFixed(0)
    } ops/s`,
  );
}

function stressQuery() {
  console.log(`\n[query] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const start = performance.now();

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const t0 = performance.now();
    callChecked("db_query", {
      path: PATH,
      sql: `SELECT * FROM ${TABLE} ORDER BY id DESC LIMIT 10`,
    });
    latencies.push(performance.now() - t0);
  }

  const wall = performance.now() - start;
  console.log("[query] latency(ms):", stats(latencies));
  console.log(
    `[query] wall=${wall.toFixed(0)}ms  throughput=${
      ((QUERY_ROUNDS / wall) * 1000).toFixed(1)
    } ops/s`,
  );
}

function stressQueryByPk() {
  console.log(`\n[query-pk] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const start = performance.now();
  const base = idBase();

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const id = base + (i % TOTAL);
    const t0 = performance.now();
    callChecked("db_query", {
      path: PATH,
      sql: `SELECT * FROM ${TABLE} WHERE id = ${id}`,
    });
    latencies.push(performance.now() - t0);
  }

  const wall = performance.now() - start;
  console.log("[query-pk] latency(ms):", stats(latencies));
  console.log(
    `[query-pk] wall=${wall.toFixed(0)}ms  throughput=${
      ((QUERY_ROUNDS / wall) * 1000).toFixed(1)
    } ops/s`,
  );
}

function stressUpdate() {
  console.log(`\n[update] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const start = performance.now();
  const base = idBase();

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const id = base + (i % TOTAL);
    const t0 = performance.now();
    callChecked("db_update", {
      path: PATH,
      sql: `UPDATE ${TABLE} SET age = ${i % 100} WHERE id = ${id}`,
    });
    latencies.push(performance.now() - t0);
  }

  const wall = performance.now() - start;
  console.log("[update] latency(ms):", stats(latencies));
  console.log(
    `[update] wall=${wall.toFixed(0)}ms  throughput=${
      ((QUERY_ROUNDS / wall) * 1000).toFixed(1)
    } ops/s`,
  );
}

function stressDelete() {
  console.log(`\n[delete] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const start = performance.now();
  const base = idBase();

  const values = Array.from(
    { length: QUERY_ROUNDS },
    (_, i) => `(${base + i}, 'del_${i}', 0)`,
  ).join(",");
  callChecked("db_insert", {
    path: PATH,
    sql: `INSERT INTO ${TABLE} (id, name, age) VALUES ${values}`,
  });

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const t0 = performance.now();
    callChecked("db_delete", {
      path: PATH,
      sql: `DELETE FROM ${TABLE} WHERE id = ${base + i}`,
    });
    latencies.push(performance.now() - t0);
  }

  const wall = performance.now() - start;
  console.log("[delete] latency(ms):", stats(latencies));
  console.log(
    `[delete] wall=${wall.toFixed(0)}ms  throughput=${
      ((QUERY_ROUNDS / wall) * 1000).toFixed(1)
    } ops/s`,
  );
}

function sanityCheck() {
  console.log(`\n[sanity] insert → query → verify`);
  const id = idBase() + 9_999_999;
  callChecked("db_insert", {
    path: PATH,
    sql: `INSERT INTO ${TABLE} (id, name, age) VALUES (${id}, 'sanity', 42)`,
  });
  const res = callChecked("db_query", {
    path: PATH,
    sql: `SELECT * FROM ${TABLE} WHERE id = ${id}`,
  });
  const rows = res.data as Array<Record<string, unknown>>;
  const row = rows[0];
  const ok = row && row.id === id && row.name === "sanity" && row.age === 42;
  console.log("[sanity]", ok ? "PASS" : "FAIL", row);
  if (!ok) throw new Error("sanity check failed");
}

function main() {
  const mode = Deno.args[0] ?? "all";
  if (mode === "all" || mode === "setup") setup();
  if (mode === "all" || mode === "insert") stressInsert();
  if (mode === "all" || mode === "insert-batch") stressInsertBatch();
  if (mode === "all" || mode === "query") stressQuery();
  if (mode === "all" || mode === "query-pk") stressQueryByPk();
  if (mode === "all" || mode === "update") stressUpdate();
  if (mode === "all" || mode === "delete") stressDelete();
  if (mode === "all" || mode === "sanity") sanityCheck();
}

try {
  main();
} finally {
  close();
}
