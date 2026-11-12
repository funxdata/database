---
name: database-performance
description: database 的并发与多线程优化规范：接口冻结下用每线程连接、连接池与 WAL 提升吞吐。
---

# database 并发与多线程优化规范

## 何时使用

- 需要提升批量写入、查询或压测吞吐时。
- 调整连接管理、PRAGMA 或 SQLite 并发行为时。
- 编写多线程调用方或 Deno Worker 压测时。

## 总体原则

1. **接口冻结**：不得为并发修改 FFI 契约（见 `database-ffi-contract`）。
2. **多线程只在实现/调用方**：FFI 单次调用仍是同步的；并发来自多个调用线程/进程。
3. **SQLite 并发模型**：WAL 支持多读一写；同一时刻只有一个写者。

## 调用方

- 允许并鼓励多个线程/Worker 同时调用 5 个符号。
- 每个线程独立调用，避免在调用方再包一层全局串行锁。
- 压测/批量任务使用固定大小线程池或 `Deno.Worker`，避免无限创建线程。
- 写入同一数据库时预期单写者；读多写少场景收益最大。
- 每个并发任务使用唯一库名或明确的共享库名，避免误写。

## 库内实现

当前实现（`src/db/sqlite.rs`）：每线程连接缓存、5 秒 `busy_timeout`、WAL、`foreign_keys=ON`。继续优化时优先考虑：

1. **每线程连接或连接池**：避免每次调用 `Connection::open`；连接按 `path` 复用，线程之间不共享 `rusqlite::Connection`。
2. **`busy_timeout`**：设置合理超时（如 5 秒），避免并发写立即返回 `SQLITE_BUSY`。
3. **WAL + `synchronous=NORMAL`**：保持现有配置；读多写少时并行读有效。
4. **批量写入**：单次 SQL 使用多 VALUES（如 500 条/批）减少往返；不要在每条记录上重开连接。
5. **避免全局大锁**：连接池按 path 分片；只锁连接获取/归还，不锁整个查询执行。
6. **可选 PRAGMA**：在基准测试基础上评估 `cache_size`、`mmap_size`，不要盲目调参。

禁止：

- 跨线程共享 `rusqlite::Connection`（它不是 `Sync`）。
- 用 `Mutex<Connection>` 串行化所有请求后宣称“支持并发”。
- 为并发新增或修改 FFI 符号/字段。
- 无界线程、无界队列。

## 压测方法

```bash
cargo build --release
cd ts
deno task test
deno task stress
```

- FFI 是同步调用；`ts/sqlite_stress.ts` 当前串行。
- 需要并发压测时，用 `Deno.Worker` 启动固定数量 worker，每个 worker 加载动态库并执行独立任务；写同一库时预期单写者。
- 记录吞吐（ops/s）与 p50/p90/p99，比较优化前后。

## 检查清单

- [ ] FFI 契约未变。
- [ ] 并发调用下没有跨线程共享 Connection。
- [ ] 已设置 `busy_timeout` 或明确的锁等待策略。
- [ ] 写操作有界并发，读操作可并行。
- [ ] 有并发正确性测试与吞吐对比。
- [ ] `cargo test`、`cd ts && deno task test` 通过。
