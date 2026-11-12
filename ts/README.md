# ts · Deno FFI 客户端与测试

本目录通过 **Deno FFI 直接加载 `database` 动态库**（`Deno.dlopen`），不经过 HTTP，也不依赖 `cyctron` 或任何转发服务。

## 前置条件

```bash
cargo build --release
```

产物：

- Windows：`target/release/database.dll`
- Linux：`target/release/libdatabase.so`
- macOS：`target/release/libdatabase.dylib`

可用 `DATABASE_LIB=/abs/path/to/libdatabase.so` 覆盖默认路径。

## 运行

所有命令都在 `ts/` 目录下执行：

```bash
cd ts
deno task test      # FFI 集成测试
deno task smoke     # 冒烟测试（每个导出功能）
deno task stress    # 关系表压测
```

或直接运行示例（同样在 `ts/` 下）：

```bash
cd ts
deno run --allow-ffi --allow-env --allow-read --allow-write create.ts
deno run --allow-ffi --allow-env --allow-read --allow-write insert.ts
deno run --allow-ffi --allow-env --allow-read --allow-write query.ts
deno run --allow-ffi --allow-env --allow-read --allow-write del.ts
```

## 脚本说明

| 文件 | 说明 |
| --- | --- |
| `client.ts` | 加载动态库、定义 5 个符号、JSON 缓冲与错误处理 |
| `create.ts` / `insert.ts` / `query.ts` / `del.ts` | CRUD 示例，直接调用 FFI |
| `run_tests.ts` | CRUD + 错误校验 + 缓冲区溢出测试 |
| `sqlite_stress.ts` | 串行压测（FFI 为同步调用） |

## 注意

- 输出缓冲区默认 1 MiB，与 `MAX_JSON_OUT` 一致。
- `Deno.dlopen` 需要 `--allow-ffi`；示例还使用了 `--allow-env`（读取 `DATABASE_LIB`）与 `--allow-write`（清理测试数据库）。
- 数据库文件写入进程 CWD 下的 `./database/`。
