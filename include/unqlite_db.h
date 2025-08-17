#ifndef UNQLITE_DB_H
#define UNQLITE_DB_H

#include <unqlite.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct UnqliteDB {
    unqlite *db;           // 内部 UnQLite 数据库指针
    char path[512];        // 数据库文件路径
} UnqliteDB;

// 初始化数据库
int unqlite_db_init(const char *path, UnqliteDB **db_out);

// 执行 Jx9 脚本命令
int unqlite_db_exec(UnqliteDB *db, const char *cmd);
int unqlite_db_query(UnqliteDB *db, const char *cmd, char **result);

// KV 操作
int unqlite_db_put(UnqliteDB *db, const char *key, const char *value);
int unqlite_db_get(UnqliteDB *db, const char *key, char **value);
int unqlite_db_delete(UnqliteDB *db, const char *key);


// 关闭数据库
void unqlite_db_close(UnqliteDB *db);

#ifdef __cplusplus
}
#endif

#endif // UNQLITE_DB_H
