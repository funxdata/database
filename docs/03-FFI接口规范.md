# 03 · FFI 接口规范

## ABI 约定

所有导出函数签名一致：

```c
int32_t db_xxx(const char *json_in, char *json_out);
```

| 项 | 约定 |
| --- | --- |
| `json_in` | NUL 结尾的 UTF-8 JSON 字符串；为空指针或非法 UTF-8/JSON 时返回错误响应 |
| `json_out` | 调用方分配的缓冲区，容量必须 **≥ 1048576 字节（1 MiB）**；内容为 NUL 结尾 JSON |
| 返回值 | `0`：JSON 已写入；`-1`：`json_out` 为空；`-2`：序列化结果 ≥ 1 MiB，未写入 |
| 业务状态 | 看响应 JSON 的 `code` 字段，不看返回值 |
| 调用方式 | 仅限其它库文件/宿主通过 C ABI 加载调用；不支持 HTTP，经 `cyctron` 的 HTTP 请求不能调用 |
| 线程 | 连接按线程缓存；不同线程各自持有连接，可并发调用 |

> 返回值不是 SQLite 结果码，也不是 HTTP 状态码。`-2` 时 `json_out` 内容未定义，调用方无法得知实际所需长度，只能扩大缓冲区重试。

## 响应封套

成功：

```json
{
  "code": 200,
  "data": {},
  "msg": "success"
}
```

失败：

```json
{
  "code": 400104,
  "data": {},
  "msg": "sql is required"
}
```

- `code`：业务码，`200` 表示成功。
- `data`：成功时为对象或数组；失败时为 `{}`。
- `msg`：成功固定为 `"success"`，失败为错误描述（底层 `String`，可能包含 SQLite 原文）。

## 请求结构 `DbReq`

所有接口共用同一个反序列化结构，字段均可选（是否必填由具体接口校验）：

| 字段 | 类型 | 用于 | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | 全部 | 必填。逻辑库名，只允许 `[A-Za-z0-9_-]`，长度 1–64；最终路径 `./database/{path}.db` |
| `table` | `string?` | create | 表名，需匹配 `[A-Za-z_][A-Za-z0-9_]*`，服务端会加引号后拼接 |
| `schema` | `string?` | create | 列定义，如 `id INTEGER PRIMARY KEY, name TEXT` |
| `sql` | `string?` | insert / update / delete / query | 完整单条 SQL |

未声明的字段会被忽略（未启用 `deny_unknown_fields`）。

## 接口明细

### `db_create` — 创建表

请求：

```json
{
  "path": "users",
  "table": "users",
  "schema": "id INTEGER PRIMARY KEY, name TEXT, age INTEGER"
}
```

- 生成 SQL：`CREATE TABLE IF NOT EXISTS {table} ({schema})`。
- 已存在同名表时静默成功。
- 必填：`path`、`table`、`schema`。
- 失败：`400101`、`400102`、`400103`、`500100`、`500101`。
- `data`：`{}`。

### `db_insert` — 插入

请求：

```json
{
  "path": "users",
  "sql": "INSERT INTO users (id, name, age) VALUES (1, 'tom', 18)"
}
```

- 执行完整单条 SQL；不支持多语句（rusqlite 会拒绝尾随 SQL）。
- 必填：`path`、`sql`。
- 失败：`400101`、`400104`、`500100`、`500101`。
- `data`：`{}`。

### `db_update` — 更新

请求字段与 `db_insert` 相同，SQL 为 UPDATE。实现上复用同一 `execute_write` 路径（内部调用 `insert`）。

### `db_delete` — 删除

请求字段同 `db_insert`，SQL 为 DELETE。独立实现，但行为与 insert/update 一致。

### `db_query` — 查询

请求：

```json
{
  "path": "users",
  "sql": "SELECT * FROM users ORDER BY id DESC LIMIT 10"
}
```

返回 `data` 为对象数组：

```json
[
  { "id": 1, "name": "tom", "age": 18 },
  { "id": 2, "name": "jerry", "age": null }
]
```

列类型映射：

| SQLite 类型 | JSON |
| --- | --- |
| NULL | `null` |
| INTEGER | number |
| REAL | number |
| TEXT | string（非法 UTF-8 用替换字符） |
| BLOB | number 数组（逐字节） |

注意事项：

- 列名重复时，后者覆盖前者（`serde_json::Map` 键唯一）。
- 结果整体序列化，无分页；超过 1 MiB 直接返回 `-2`。
- 无法获取列名时以 `col{i}` 兜底。

## 导出符号

实际 C 符号名（`#[ffi_export]` 不额外加前缀）：

```text
db_create
db_insert
db_update
db_delete
db_query
```

## 调用约束

- 只允许其它库文件/宿主进程加载 `database` 动态库后直接调用上述符号。
- **不提供 HTTP 接口**；经 `cyctron` 或任何 HTTP 网关转发的请求不能调用 database。
- `ts/` 使用 `Deno.dlopen` 直接加载动态库调用上述符号，不走 HTTP；集成也可使用 `ctypes`、`cgo`、`jni`、`node-ffi` 等绑定。

## 调用示例（C 伪代码）

```c
char out[1048576];
const char *req = "{\"path\":\"users\",\"sql\":\"SELECT 1\"}";
int rc = db_query(req, out);
if (rc != 0) {
    /* -1 空指针 / -2 结果过大 */
} else {
    /* 解析 out 中的 JSON，检查 code */
}
```
