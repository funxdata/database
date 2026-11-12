---
name: database-testing
description: database 项目的测试与代码组织规范。适用于新增/修改测试、调整 FFI 接口或整理 src 结构时：TypeScript 测试必须通过 Deno FFI 直连动态库（禁止 HTTP/cyctron）；Rust 测试放在 units/ 与 tests/；src/ 内禁止测试代码；mod.rs 只允许模块声明。
---

# database 测试与代码组织规范

## 何时使用

- 新增或修改 `database` 的测试。
- 调整 FFI 实现或动态库产物（先阅读 `database-ffi-contract`；已发布接口不得改动）。
- 进行并发/多线程优化（见 `database-performance`）。
- 整理 `src/`、`units/`、`tests/`、`ts/` 目录。
- 需要判断某段代码应该放在哪里。

## 核心规则

> FFI 已发布接口不得改动，见 `database-ffi-contract`；并发优化见 `database-performance`。

### 1. TypeScript 测试只走 Deno FFI，禁止 HTTP

- `ts/` 中所有测试与示例必须使用 `Deno.dlopen` 加载动态库：
  - Windows：`../target/release/database.dll`
  - Linux：`../target/release/libdatabase.so`
  - macOS：`../target/release/libdatabase.dylib`
- 所有 `ts/` 命令都在 `ts/` 目录下执行。
- 禁止使用 `fetch`、HTTP 端点、`cyctron` 转发或任何本地服务。
- 统一通过 `ts/client.ts` 的 `call` / `callOk` 调用 5 个符号：
  `db_create`、`db_insert`、`db_update`、`db_delete`、`db_query`。
- 输出缓冲区至少 1 MiB（与 `MAX_JSON_OUT = 1024 * 1024` 一致）。
- 运行命令：

```bash
cargo build --release
cd ts
deno task test
deno task check
```

### 2. Rust 测试放在 `units/` 与 `tests/`

- `tests/`：领域层/集成测试，直接 `use database::db::sqlite::FunxDB`。
- `units/`：C ABI、协议层测试；在 `Cargo.toml` 中注册：

```toml
[[test]]
name = "units_ffi"
path = "units/ffi_test.rs"

[[test]]
name = "units_cjson"
path = "units/cjson_test.rs"
```

- `Cargo.toml` 的 `crate-type` 必须保留 `rlib`，否则测试无法引用 crate：

```toml
[lib]
crate-type = ["cdylib", "rlib"]
```

- 测试数据库使用唯一名称（进程 ID + 时间戳），并在 `Drop` 中清理：
  `./database/<name>.db`、`.db-wal`、`.db-shm`。
- 运行：

```bash
cargo test
```

### 3. `src/` 中禁止测试代码

- 不写 `#[cfg(test)]`、`mod tests`、测试辅助函数或测试专用依赖注入。
- 所有测试代码必须放在 `tests/` 或 `units/`。

### 4. `mod.rs` 只允许模块声明

允许：

```rust
pub mod sqlite;
pub mod cjson;
pub mod ffi;
```

不允许在 `mod.rs` 中写函数、结构体、常量、业务逻辑或测试。业务代码放到具体模块文件中。

### 5. 调用约束

- database 只允许被其它库文件/宿主通过 C ABI 直接调用。
- 不提供 HTTP 接口；`cyctron` 的 HTTP 请求不能调用 database。
- `ts/` 是 FFI 客户端，不是 HTTP 客户端。

## 新增测试检查清单

1. 测试是否放在 `tests/` 或 `units/`，而不是 `src/`？
2. `units/` 的新文件是否在 `Cargo.toml` 注册了 `[[test]]`？
3. 是否使用唯一库名并清理 `.db` / `-wal` / `-shm`？
4. TypeScript 测试是否直接 `Deno.dlopen`，没有 `fetch`/HTTP？
5. 是否覆盖成功路径、校验错误和缓冲区边界？
6. 是否运行了 `cargo test` 与 `cd ts && deno task test`？

## 常用命令

```bash
cargo build --release   # 生成动态库，供 Deno FFI 使用
cargo test              # Rust 测试（tests/ + units/）
cd ts
deno task test          # TypeScript FFI 测试
deno task smoke         # 每个导出功能的冒烟测试
deno task check         # TypeScript 类型检查
deno task stress        # 串行 FFI 压测
```
