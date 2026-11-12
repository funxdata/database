---
name: database-ffi-contract
description: database 的 FFI 契约冻结规范：5 个符号、JSON 协议、1 MiB 缓冲区与错误码不得改动。
---

# database FFI 契约冻结规范

## 何时使用

- 修改 `src/utils/ffi.rs`、`src/utils/cjson.rs` 或导出符号时。
- 新增数据库能力、调整请求/响应字段时。
- 评审任何可能影响宿主或其它库文件的变更时。

## 冻结内容（不得改动）

以下内容视为已发布的 ABI/协议契约：

1. **符号名与签名**：
   - `db_create`
   - `db_insert`
   - `db_update`
   - `db_delete`
   - `db_query`
   - 统一签名：`int32_t db_xxx(const char *json_in, char *json_out)`
2. **请求字段**：`path`、`table`、`schema`、`sql`；字段名与类型不变。
3. **响应封套**：`{ "code": number, "data": any, "msg": string }`；成功码 `200`。
4. **错误码语义**：`400101`/`400102`/`400103`/`400104`/`500100`/`500101` 的含义不变。
5. **缓冲区契约**：`json_out` 至少 1 MiB（`MAX_JSON_OUT = 1048576`）；返回 `0` 成功写入、`-1` 空指针、`-2` 超限。
6. **调用方式**：仅 C ABI 库调用；不提供 HTTP 接口。

## 禁止事项

- 重命名、删除或改变上述 5 个符号的签名。
- 修改请求字段名、类型或必填语义。
- 修改响应封套结构、成功码或错误码含义。
- 缩小 1 MiB 输出上限；扩大也需按版本化流程处理。
- 通过 HTTP/`cyctron` 暴露这些符号。

## 允许的变更

- 内部实现优化（连接管理、执行路径、序列化），只要可观察行为不变。
- 新增**独立命名**的导出函数（如 `db_query_v2`），并保留旧符号。
- 文档、注释、测试补充。
- 不改变现有字段语义的前提下增加可选字段（需确认旧调用方忽略未知字段）。

## 变更流程

1. 优先新增函数而不是修改旧函数；旧符号至少保留一个发布周期。
2. 在 `docs/03-FFI接口规范.md`、`src/utils/ffi.rs`、`units/ffi_test.rs` 同步契约。
3. 更新 `ts/client.ts` 的符号映射与测试。
4. 运行 `cargo test`、`cargo build --release`，并在 `ts/` 下运行 `deno task check`、`deno task test`。
5. 校验动态库导出表只包含预期符号。

## 检查清单

- [ ] 5 个符号名与签名未变。
- [ ] `DbReq` 字段未变。
- [ ] 响应封套与错误码未变。
- [ ] 1 MiB 缓冲区契约未变。
- [ ] 没有新增 HTTP 入口。
- [ ] Rust 与 Deno FFI 测试均通过。
