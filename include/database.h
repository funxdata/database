#pragma once
#include "kv_db.h"
#include "unqlite_db.h"
#include "sqlite_db.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    DB_SQLITE,
    DB_UNQLITE,
    DB_KVDB
} DB_TYPE;

typedef struct {
    DB_TYPE type;
    void *handle;  // 内部数据库句柄（由各数据库 open 返回）
} Database;

// 初始化数据库，返回 0 成功（db->handle 会被设置）
int database_init(Database *db, DB_TYPE type, const char *name);

// KVDB 操作
int database_kvdb_put(Database *db, const char *key, const char *value);
int database_kvdb_get(Database *db, const char *key, char **value);
int database_kvdb_delete(Database *db, const char *key);

// SQL / 文档数据库操作
int database_exec(Database *db, const char *cmd);
int database_query(Database *db, const char *cmd, char **result);

// 关闭数据库并释放句柄
void database_close(Database *db);

#ifdef __cplusplus
}
#endif
