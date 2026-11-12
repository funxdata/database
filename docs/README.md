# database 项目文档

`database` 是一个以 **Rust `cdylib` + C ABI** 形式交付的本地小型数据库系统，基于 SQLite（rusqlite bundled），对外暴露一组以 JSON 收发数据的 FFI 函数，提供关系表 CRUD 与查询能力。

调用方式：**仅限其它库文件/宿主进程通过 C ABI 加载调用**。本库不提供 HTTP 接口；经 `cyctron` 的 HTTP 请求不能调用 database。

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [01-项目概览.md](./01-项目概览.md) | 项目定位、能力边界、技术栈、目录结构 |
| [02-架构设计.md](./02-架构设计.md) | 分层结构、调用流程、模块职责、运行时行为 |
| [03-FFI接口规范.md](./03-FFI接口规范.md) | 导出符号、JSON 协议、请求字段、返回码、缓冲区约定 |
| [04-数据存储与SQLite.md](./04-数据存储与SQLite.md) | 数据目录、连接参数、关系表、类型映射 |
| [05-构建与发布.md](./05-构建与发布.md) | 本地构建、产物、跨平台 CI 与 dytes 发布流程 |
| [06-调用方式与集成约束.md](./06-调用方式与集成约束.md) | 仅库文件调用、Deno FFI 示例、禁止 HTTP 转发 |
| [07-质量现状与测试.md](./07-质量现状与测试.md) | 现有测试空白、验证手段、质量基线与改进方向 |
| [08-冒烟测试报告.md](./08-冒烟测试报告.md) | 5 个导出功能的冒烟测试结果与分析 |

规范与改进事项不在本文档中展开，统一记录在仓库根目录的 [`issues/`](../issues/README.md)。

## 快速事实

- 库名：`database`（Windows 产物 `database.dll`，Linux `libdatabase.so`，macOS `libdatabase.dylib`）。
- 导出函数：5 个，**无前缀**：`db_create`、`db_insert`、`db_update`、`db_delete`、`db_query`。
- 调用方式：仅 C ABI 库调用；不支持 HTTP / `cyctron` 转发。
- 数据存放：进程当前工作目录下的 `./database/<name>.db`。
- 数据库模式：WAL + `synchronous=NORMAL`。
- 输出缓冲区：固定上限 **1 MiB**（`MAX_JSON_OUT = 1048576`）。
- 测试：`cargo test`（Rust）与 `cd ts && deno task test`（Deno FFI）；规范见 `skills/database-testing/SKILL.md`、`skills/database-ffi-contract/SKILL.md`、`skills/database-performance/SKILL.md`。
- 版本：`1.0.6`（`Cargo.toml` 与 `dytes.json` 一致）。
- 构建：`cargo build --release`；README 已更新为实际构建方式。
