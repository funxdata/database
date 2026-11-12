# 项目技能

本目录存放项目内的操作规范，供维护者与编码代理在改动 `database` 时遵循。

| 技能 | 说明 |
| --- | --- |
| [database-testing](./database-testing/SKILL.md) | 测试组织与 FFI 调用规范：Rust 测试、Deno FFI、禁止 HTTP、`src/` 与 `mod.rs` 约束 |
| [database-ffi-contract](./database-ffi-contract/SKILL.md) | FFI 契约冻结：5 个符号、JSON 协议、1 MiB 缓冲区与错误码不得改动 |
| [database-performance](./database-performance/SKILL.md) | 并发与多线程优化：每线程连接/连接池、WAL、`busy_timeout`、批量写入 |

> 运行时副本位于 `.reasonix/skills/`，可通过 `/database-ffi-contract`、`/database-performance`、`/database-testing` 调用。修改规范时请同步两处内容。
