# 04 · 数据存储与 SQLite

## 数据目录与命名

```rust
const DATABASE_DIR: &str = "./database";
```

- 目录相对于**进程当前工作目录**，不是库文件所在目录。
- `FunxDB::open(name)` 先 `create_dir_all("./database")`，再打开 `./database/{name}.db`。
- `name` 来自请求字段 `path`，通过 `validate_name` 校验：
  - 只允许 `[A-Za-z0-9_-]`，长度 1–64；
  - 拒绝空串、路径分隔符、`..`、绝对路径与盘符；
  - 合法示例：`"users"` → `./database/users.db`。
- 非法库名在 `open` 阶段返回错误，FFI 侧表现为 `500100`。
- 同名的 WAL 模式还会产生 `-wal`、`-shm` 伴随文件。

## 连接初始化

```rust
Connection::open(db_path)?
conn.busy_timeout(Duration::from_secs(5))?
conn.pragma_update(None, "journal_mode", "WAL")?
conn.pragma_update(None, "synchronous", "NORMAL")?
conn.pragma_update(None, "foreign_keys", "ON")?
```

| 设置 | 值 | 目的 |
| --- | --- | --- |
| `journal_mode` | `WAL` | 写不阻塞读，提高并发读与逐条写吞吐 |
| `synchronous` | `NORMAL` | 减少 fsync；崩溃时可能丢失最近事务，但数据库保持一致 |
| `busy_timeout` | `5s` | 并发写冲突时等待锁，而不是立即失败 |
| `foreign_keys` | `ON` | 启用外键约束 |

未设置：

- `temp_store`、`cache_size`、`mmap_size` 等性能参数。
- `PRAGMA user_version`：当前没有 schema 版本/迁移机制。

## 关系表

建表：

```sql
CREATE TABLE IF NOT EXISTS {table} ({schema})
```

- 表名先通过白名单校验（`[A-Za-z_][A-Za-z0-9_]*`），再用双引号包裹，兼容 SQL 保留字。
- 列定义 `schema` 仍是受信任 DDL，由调用方负责内容正确性。
- `schema` 中的列定义直接拼接到 `CREATE TABLE` 语句。

写入：

```sql
-- insert / update / delete 均通过 Connection::execute(sql, [])
INSERT ...;
UPDATE ...;
DELETE ...;
```

- 只支持一条语句；rusqlite 对尾随 SQL 返回 `MultipleStatement`。
- SQL 仅由调用方库内部发起；接口不提供参数绑定。
- `execute` 不返回受影响行数给调用方（被丢弃）。

查询：

1. `prepare(sql)`；
2. `column_count()` 与 `column_name(i)` 取列名，失败回退 `col{i}`；
3. `query_map` 逐行、逐列调用 `get_ref(i)`；
4. 按 `ValueRef` 转 JSON；
5. 汇总为数组，一次性序列化。

限制：无 `LIMIT` 建议、无流式返回、无分页游标；大结果集在内存中完整构建后再序列化，且受 1 MiB 输出上限约束。

## 类型与编码对照

| 场景 | 编码 |
| --- | --- |
| JSON 数字 → SQLite INTEGER/REAL | 由 SQL 字面量决定（接口不绑定参数） |
| SQLite INTEGER → JSON | 数字 |
| SQLite REAL → JSON | 数字 |
| SQLite TEXT → JSON | UTF-8 字符串（`from_utf8_lossy`） |
| SQLite BLOB → JSON | 字节数组（体积膨胀约 3–4 倍） |
| 响应 JSON → C 缓冲区 | UTF-8 + 末尾 `\0`，上限 1048576 字节（1 MiB） |

## 容量与性能特征

- 连接按线程缓存，WAL 文件随连接创建；同一线程复用连接，减少打开/PRAGMA 开销。
- WAL + `NORMAL` 提升写入吞吐，但每次 FFI 调用仍是一次独立的自动提交事务。
- 查询结果全量物化 + JSON 序列化，内存峰值与结果集大小成正比。
- 1 MiB 输出上限仍会限制单次查询的结果量（含 BLOB 或长文本时更明显），超出时返回 `-2`。
