const ENDPOINT = "http://127.0.0.1:44944/database";
const PATH = "./sqlstress";        // 独立 db 文件
const TABLE = "items";

const TOTAL = 2000;
const CONCURRENCY = 20;
const QUERY_ROUNDS = 200;
const BATCH_SIZE = 500;

// ---------- 工具 ----------
async function call(symbol: string, body: unknown) {
  const t0 = performance.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/libary",
      "FFI-Symbol": symbol,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const dt = performance.now() - t0;
  if (json.code !== 200) {
    throw new Error(`${symbol} failed: ${JSON.stringify(json)}`);
  }
  return { json, dt };
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
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

async function runPool<T>(
  total: number,
  concurrency: number,
  fn: (i: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(total);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= total) return;
      results[i] = await fn(i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, worker),
  );
  return results;
}

function idBase(): number {
  return Date.now() * 1000;
}

// ---------- 1. 建表 ----------
async function setup() {
  console.log(`[setup] create table ${TABLE}`);
  const { json } = await call("db_create", {
    path: PATH,
    table: TABLE,
    schema: "id INTEGER PRIMARY KEY, name TEXT, age INTEGER",
  });
  console.log("[setup] ok", json);
}

// ---------- 2. 单条插入压测 ----------
async function stressInsert() {
  console.log(`\n[insert] total=${TOTAL} concurrency=${CONCURRENCY}`);
  const latencies: number[] = [];
  const globalStart = performance.now();
  const base = idBase();

  await runPool(TOTAL, CONCURRENCY, async (i) => {
    const id = base + i;
    const { dt } = await call("db_insert", {
      path: PATH,
      sql: `INSERT INTO ${TABLE} (id, name, age) VALUES (${id}, 'user_${i}', ${i % 100})`,
    });
    latencies.push(dt);
  });

  const wall = performance.now() - globalStart;
  const s = stats(latencies);
  console.log("[insert] latency(ms):", s);
  console.log(
    `[insert] wall=${wall.toFixed(0)}ms  throughput=${((TOTAL / wall) * 1000).toFixed(0)} ops/s`,
  );
  return s;
}

// ---------- 3. 批量插入压测（单条 SQL 多 VALUES） ----------
async function stressInsertBatch() {
  console.log(`\n[insert-batch] total=${TOTAL} batch=${BATCH_SIZE}`);
  const latencies: number[] = [];
  const globalStart = performance.now();
  const base = idBase();

  for (let off = 0; off < TOTAL; off += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, TOTAL - off);
    const values = Array.from(
      { length: count },
      (_, i) => `(${base + off + i}, 'user_${off + i}', ${i % 100})`,
    ).join(",");
    const sql = `INSERT INTO ${TABLE} (id, name, age) VALUES ${values}`;
    const { dt } = await call("db_insert", { path: PATH, sql });
    latencies.push(dt);
  }

  const wall = performance.now() - globalStart;
  const s = stats(latencies);
  console.log("[insert-batch] batch latency(ms):", s);
  console.log(
    `[insert-batch] wall=${wall.toFixed(0)}ms  throughput=${((TOTAL / wall) * 1000).toFixed(0)} ops/s`,
  );
  return s;
}

// ---------- 4. 查询压测 ----------
async function stressQuery() {
  console.log(`\n[query] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const globalStart = performance.now();

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const { dt } = await call("db_query", {
      path: PATH,
      sql: `SELECT * FROM ${TABLE} ORDER BY id DESC LIMIT 10`,
    });
    latencies.push(dt);
  }

  const wall = performance.now() - globalStart;
  const s = stats(latencies);
  console.log("[query] latency(ms):", s);
  console.log(
    `[query] wall=${wall.toFixed(0)}ms  throughput=${((QUERY_ROUNDS / wall) * 1000).toFixed(1)} ops/s`,
  );
  return s;
}

// ---------- 5. 按主键查询压测 ----------
async function stressQueryByPk() {
  console.log(`\n[query-pk] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const globalStart = performance.now();
  const base = idBase();

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const id = base + (i % TOTAL);
    const { dt } = await call("db_query", {
      path: PATH,
      sql: `SELECT * FROM ${TABLE} WHERE id = ${id}`,
    });
    latencies.push(dt);
  }

  const wall = performance.now() - globalStart;
  const s = stats(latencies);
  console.log("[query-pk] latency(ms):", s);
  console.log(
    `[query-pk] wall=${wall.toFixed(0)}ms  throughput=${((QUERY_ROUNDS / wall) * 1000).toFixed(1)} ops/s`,
  );
  return s;
}

// ---------- 6. 更新压测 ----------
async function stressUpdate() {
  console.log(`\n[update] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const globalStart = performance.now();
  const base = idBase();

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const id = base + (i % TOTAL);
    const { dt } = await call("db_update", {
      path: PATH,
      sql: `UPDATE ${TABLE} SET age = ${i % 100} WHERE id = ${id}`,
    });
    latencies.push(dt);
  }

  const wall = performance.now() - globalStart;
  const s = stats(latencies);
  console.log("[update] latency(ms):", s);
  console.log(
    `[update] wall=${wall.toFixed(0)}ms  throughput=${((QUERY_ROUNDS / wall) * 1000).toFixed(1)} ops/s`,
  );
  return s;
}

// ---------- 7. 删除压测 ----------
async function stressDelete() {
  console.log(`\n[delete] rounds=${QUERY_ROUNDS}`);
  const latencies: number[] = [];
  const globalStart = performance.now();
  const base = idBase();

  // 先插入 QUERY_ROUNDS 条待删数据
  const values = Array.from(
    { length: QUERY_ROUNDS },
    (_, i) => `(${base + i}, 'del_${i}', 0)`,
  ).join(",");
  await call("db_insert", {
    path: PATH,
    sql: `INSERT INTO ${TABLE} (id, name, age) VALUES ${values}`,
  });

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const id = base + i;
    const { dt } = await call("db_delete", {
      path: PATH,
      sql: `DELETE FROM ${TABLE} WHERE id = ${id}`,
    });
    latencies.push(dt);
  }

  const wall = performance.now() - globalStart;
  const s = stats(latencies);
  console.log("[delete] latency(ms):", s);
  console.log(
    `[delete] wall=${wall.toFixed(0)}ms  throughput=${((QUERY_ROUNDS / wall) * 1000).toFixed(1)} ops/s`,
  );
  return s;
}

// ---------- 8. 正确性校验 ----------
async function sanityCheck() {
  console.log(`\n[sanity] insert → query → verify`);
  const id = idBase() + 9_999_999;
  await call("db_insert", {
    path: PATH,
    sql: `INSERT INTO ${TABLE} (id, name, age) VALUES (${id}, 'sanity', 42)`,
  });
  const { json } = await call("db_query", {
    path: PATH,
    sql: `SELECT * FROM ${TABLE} WHERE id = ${id}`,
  });
  const row = json.data[0];
  const ok = row && row.id === id && row.name === "sanity" && row.age === 42;
  console.log("[sanity]", ok ? "PASS" : "FAIL", row);
  if (!ok) throw new Error("sanity check failed");
}

// ---------- main ----------
async function main() {
  const mode = Deno.args[0] ?? "all";
  if (mode === "all" || mode === "setup") await setup();
  if (mode === "all" || mode === "insert") await stressInsert();
  if (mode === "all" || mode === "insert-batch") await stressInsertBatch();
  if (mode === "all" || mode === "query") await stressQuery();
  if (mode === "all" || mode === "query-pk") await stressQueryByPk();
  if (mode === "all" || mode === "update") await stressUpdate();
  if (mode === "all" || mode === "delete") await stressDelete();
  if (mode === "all" || mode === "sanity") await sanityCheck();
}

await main();


