#include "database.h"
#include "unqlite_db.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#ifdef _WIN32
#include <direct.h>   // _mkdir
#define mkdir(path, mode) _mkdir(path)
#else
#include <sys/stat.h>
#include <sys/types.h>
#endif

// --------------------------
// SQLite 封装结构体
// --------------------------
typedef struct {
    SqliteDB *db;
} SqliteWrapper;

// --------------------------
// KVDB 封装结构体
// --------------------------
typedef struct {
    char path[512];
} KVDBWrapper;

// --------------------------
// 数据库初始化
// --------------------------
int database_init(Database *db, DB_TYPE type, const char *name) {
    if (!db || !name) return -1;

    db->type = type;
    db->handle = NULL;

    switch (type) {
        case DB_SQLITE: {
            SqliteWrapper *wrapper = (SqliteWrapper*)malloc(sizeof(SqliteWrapper));
            wrapper->db = (SqliteDB*)malloc(sizeof(SqliteDB));
            if (!wrapper || !wrapper->db) return -1;

            int rc = sqlite_db_init(wrapper->db, name);
            if (rc != 0) {
                free(wrapper->db);
                free(wrapper);
                return rc;
            }
            db->handle = wrapper;
            return 0;
        }
        case DB_UNQLITE: {
            UnqliteDB *udb = NULL;
            int rc = unqlite_db_init(name, &udb);
            if (rc != 0) return rc;
            db->handle = udb;
            return 0;
        }
        case DB_KVDB: {
            KVDBWrapper *kdb = (KVDBWrapper*)malloc(sizeof(KVDBWrapper));
            snprintf(kdb->path, sizeof(kdb->path), "%s", name);
            mkdir(name, 0755);
            db->handle = kdb;
            return 0;
        }
        default:
            return -1;
    }
}

// --------------------------
// 执行命令（Jx9/SQL/KV）
// --------------------------
int database_exec(Database *db, const char *cmd) {
    if (!db || !cmd) return -1;

    switch (db->type) {
        case DB_SQLITE: {
            SqliteWrapper *wrapper = (SqliteWrapper*)db->handle;
            return sqlite_db_exec(wrapper->db, cmd);
        }
        case DB_UNQLITE: {
            UnqliteDB *udb = (UnqliteDB*)db->handle;
            return unqlite_db_exec(udb, cmd);
        }
        case DB_KVDB: {
            // KVDB exec 可扩展为解析 key/value
            printf("[KVDB exec] cmd: %s\n", cmd);
            return 0;
        }
        default:
            return -1;
    }
}

// --------------------------
// 查询命令
// --------------------------
// database.c - database_query 函数中
int database_query(Database *db, const char *cmd, char **result) {
    if (!db || !cmd || !result) return -1;

    switch (db->type) {
        case DB_SQLITE: {
            SqliteWrapper *wrapper = (SqliteWrapper*)db->handle;
            return sqlite_db_query(wrapper->db, cmd, result);
        }
        case DB_UNQLITE: {
            UnqliteDB *udb = (UnqliteDB*)db->handle;
            return unqlite_db_get(udb, cmd, result);   // <- 这里改成 unqlite_db_get
        }
        case DB_KVDB: {
            *result = strdup("kvdb_result");
            return 0;
        }
        default:
            return -1;
    }
}

// --------------------------
// KV 操作
// --------------------------
int database_kvdb_put(Database *db, const char *key, const char *value) {
    if (!db || !key || !value) return -1;

    if (db->type == DB_KVDB) {
        KVDBWrapper *kdb = (KVDBWrapper*)db->handle;
        char path[1024];
        snprintf(path, sizeof(path), "%s/%s.kv", kdb->path, key);
        FILE *fp = fopen(path, "w");
        if (!fp) return -1;
        fwrite(value, 1, strlen(value), fp);
        fclose(fp);
        return 0;
    } else if (db->type == DB_UNQLITE) {
        UnqliteDB *udb = (UnqliteDB*)db->handle;
        return unqlite_db_put(udb, key, value);
    }

    return -1;
}

int database_kvdb_get(Database *db, const char *key, char **value) {
    if (!db || !key || !value) return -1;

    if (db->type == DB_KVDB) {
        KVDBWrapper *kdb = (KVDBWrapper*)db->handle;
        char path[1024];
        snprintf(path, sizeof(path), "%s/%s.kv", kdb->path, key);
        FILE *fp = fopen(path, "r");
        if (!fp) return -1;
        fseek(fp, 0, SEEK_END);
        long size = ftell(fp);
        fseek(fp, 0, SEEK_SET);
        *value = (char*)malloc(size + 1);
        fread(*value, 1, size, fp);
        (*value)[size] = '\0';
        fclose(fp);
        return 0;
    } else if (db->type == DB_UNQLITE) {
        UnqliteDB *udb = (UnqliteDB*)db->handle;
        return unqlite_db_get(udb, key, value);
    }

    return -1;
}

int database_kvdb_delete(Database *db, const char *key) {
    if (!db || !key) return -1;

    if (db->type == DB_KVDB) {
        KVDBWrapper *kdb = (KVDBWrapper*)db->handle;
        char path[1024];
        snprintf(path, sizeof(path), "%s/%s.kv", kdb->path, key);
        return remove(path);
    } else if (db->type == DB_UNQLITE) {
        UnqliteDB *udb = (UnqliteDB*)db->handle;
        return unqlite_db_delete(udb, key);
    }

    return -1;
}

// --------------------------
// 关闭数据库
// --------------------------
void database_close(Database *db) {
    if (!db || !db->handle) return;

    switch (db->type) {
        case DB_SQLITE: {
            SqliteWrapper *wrapper = (SqliteWrapper*)db->handle;
            sqlite_db_close(wrapper->db);
            free(wrapper->db);
            free(wrapper);
            break;
        }
        case DB_UNQLITE: {
            UnqliteDB *udb = (UnqliteDB*)db->handle;
            unqlite_db_close(udb);
            break;
        }
        case DB_KVDB: {
            KVDBWrapper *kdb = (KVDBWrapper*)db->handle;
            free(kdb);
            break;
        }
        default:
            break;
    }

    db->handle = NULL;
}
