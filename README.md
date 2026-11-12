# database

本地小型数据库运行时，以 Rust 动态库（C ABI）形式交付，基于 SQLite（`rusqlite` bundled），提供关系表 CRUD 与查询能力。

**调用方式**：仅允许其它库文件/宿主进程通过 C ABI 加载调用；不提供 HTTP 接口，经 `cyctron` 等 HTTP 网关的请求不能调用 database。

## 导出接口

```text
db_create
db_insert
db_update
db_delete
db_query
```

统一签名：

```c
int32_t db_xxx(const char *json_in, char *json_out);
```

- 请求/响应均为 JSON，响应封套为 `{ "code": 200, "data": ..., "msg": "success" }`。
- `json_out` 至少 1 MiB；返回 `0` 成功写入、`-1` 空指针、`-2` 超过 1 MiB。
- 详细协议见 [`docs/03-FFI接口规范.md`](docs/03-FFI接口规范.md)。

## 构建

前置条件：Rust stable、C 编译器（Windows 用 MSVC Build Tools，Linux 用 gcc/clang，macOS 用 Xcode Command Line Tools）。

```bash
cargo build --release
```

产物：

| 平台 | 文件 |
| --- | --- |
| Windows | `target/release/database.dll` |
| Linux | `target/release/libdatabase.so` |
| macOS | `target/release/libdatabase.dylib` |

## 测试

```bash
cargo test              # tests/ 与 units/ 中的 Rust 测试
cargo build --release   # Deno FFI 测试需要动态库
cd ts && deno task test # ts/ 中的 Deno FFI 测试
cd ts && deno task smoke # 每个导出功能的冒烟测试
cd ts && deno task check # TypeScript 类型检查
```

测试与代码组织规范见 [`skills/`](skills/README.md)。

## 使用示例

```c
char out[1048576];
const char *req = "{\"path\":\"users\",\"sql\":\"SELECT 1\"}";
int rc = db_query(req, out);
/* rc != 0: -1 空指针 / -2 结果过大；否则解析 out 中的 JSON */
```

- 数据库文件位于进程 CWD 下的 `./database/<name>.db`。
- `path` 是逻辑库名，只允许 `[A-Za-z0-9_-]`，长度 1–64。
- 连接按线程缓存，WAL 模式；并发写有 5 秒 `busy_timeout`。

## 目录

```text
src/        Rust 实现（cdylib + rlib）
tests/      Rust 集成测试
units/      C ABI / 协议层测试
ts/         Deno FFI 客户端与测试
docs/       项目文档
issues/     规范与改进事项
skills/     项目技能与操作规范
```

## 文档与规范

- [docs/README.md](docs/README.md)：文档索引
- [issues/README.md](issues/README.md)：待处理的规范与改进事项
- [skills/README.md](skills/README.md)：测试、FFI 契约、并发规范

## License

MIT
