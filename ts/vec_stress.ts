const ENDPOINT = "http://127.0.0.1:44944/database";
const DIM = 4;              // 与 vec_create.ts 保持一致
const PATH = "./stress";    // 独立的 db 文件，不污染 ./users
const TABLE = "vec_stress";

// 可调参数
const TOTAL = 2000;         // 总插入条数
const CONCURRENCY = 20;     // 单条插入并发数
const QUERY_ROUNDS = 200;   // 查询次数
const K = 10;               // KNN 返回条数
const BATCH_SIZE = 500;     // 批量插入每批条数

// ---------- 工具 ----------
function randVec(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

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

// 并发池：控制同时进行的请求数
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

// 生成不冲突的 rowid 基数，保证重复运行不会主键冲突
function rowidBase(): number {
  return Date.now() * 1000;
}

// ---------- 1. 建表 ----------
async function setup() {
  console.log(`[setup] create vec table ${TABLE} dim=${DIM}`);
  const { json } = await call("db_vec_create", {
    path: PATH,
    table: TABLE,
    dimensions: DIM,
  });
  console.log("[setup] ok", json);
}

// ---------- 2. 单条插入压测 ----------
async function stressInsert() {
  console.log(`\n[insert] total=${TOTAL} concurrency=${CONCURRENCY}`);
  const latencies: number[] = [];
  const globalStart = performance.now();
  const base = rowidBase();

  await runPool(TOTAL, CONCURRENCY, async (i) => {
    const embedding = randVec(DIM);
    const { dt } = await call("db_vec_insert", {
      path: PATH,
      table: TABLE,
      rowid: base + i,
      embedding,
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

// ---------- 3. 批量插入压测（单事务） ----------
async function stressInsertBatch() {
  console.log(`\n[insert-batch] total=${TOTAL} batch=${BATCH_SIZE}`);
  const latencies: number[] = [];
  const globalStart = performance.now();
  const base = rowidBase();

  for (let off = 0; off < TOTAL; off += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, TOTAL - off);
    const items = Array.from(
      { length: count },
      (_, i) => ({
        rowid: base + off + i,
        embedding: randVec(DIM),
      }),
    );
    const { dt } = await call("db_vec_insert_batch", {
      path: PATH,
      table: TABLE,
      items,
    });
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
  console.log(`\n[query] rounds=${QUERY_ROUNDS} k=${K}`);
  const latencies: number[] = [];
  const globalStart = performance.now();

  for (let i = 0; i < QUERY_ROUNDS; i++) {
    const q = randVec(DIM);
    const { dt, json } = await call("db_vec_query", {
      path: PATH,
      table: TABLE,
      embedding: q,
      k: K,
    });
    if (json.data.length > K) {
      throw new Error(`query returned more than k results: ${json.data.length}`);
    }
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

async function sanityCheck() {
  console.log(`\n[sanity] insert 1 known vector then query it`);
  const v = [0.1, 0.2, 0.3, 0.4];
  const rowid = rowidBase() + 999_999;
  await call("db_vec_insert", {
    path: PATH,
    table: TABLE,
    rowid,
    embedding: v,
  });
  const { json } = await call("db_vec_query", {
    path: PATH,
    table: TABLE,
    embedding: v,
    k: 5,
  });
  const hit = json.data.find((r: any) => r.rowid === rowid);
  const ok = hit && hit.distance < 1e-6;
  console.log("[sanity]", ok ? "PASS" : "FAIL", hit ?? json.data);
  if (!ok) throw new Error("sanity check failed");
}

// ---------- main ----------
async function main() {
  const mode = Deno.args[0] ?? "all";
  if (mode === "all" || mode === "setup") await setup();
  if (mode === "all" || mode === "insert") await stressInsert();
  if (mode === "all" || mode === "insert-batch") await stressInsertBatch();
  if (mode === "all" || mode === "query") await stressQuery();
  if (mode === "all" || mode === "sanity") await sanityCheck();
}

await main();
