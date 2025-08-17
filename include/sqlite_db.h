#pragma once
#include "../packages/sqlite/sqlite3.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    sqlite3 *handle;
    char *name;
} SqliteDB;

// 初始化数据库（目录 ./db/sqldb/<name>/<name>.db）
// 返回 0 成功
int sqlite_db_init(SqliteDB *db, const char *name);

// 执行 SQL（如 CREATE TABLE, INSERT 等）
// 返回 0 成功
int sqlite_db_exec(SqliteDB *db, const char *sql);

// 查询 SQL，返回结果字符串（调用者 free）
// 返回 0 成功
int sqlite_db_query(SqliteDB *db, const char *sql, char **result);

// 关闭数据库
void sqlite_db_close(SqliteDB *db);

#ifdef __cplusplus
}
#endif
