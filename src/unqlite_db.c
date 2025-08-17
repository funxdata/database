#include "../include/unqlite_db.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <direct.h>  // _mkdir
#define mkdir(path, mode) _mkdir(path)
#else
#include <sys/stat.h>
#include <sys/types.h>
#endif

// 创建目录（递归）
static void make_dir(const char *path) {
    char tmp[512];
    size_t len = strlen(path);
    for (size_t i = 0; i < len; ++i) {
        tmp[i] = path[i];
        if (path[i] == '/' || path[i] == '\\') {
            tmp[i] = '\0';
            mkdir(tmp, 0755);
            tmp[i] = path[i];
        }
    }
    mkdir(path, 0755);
}

// 初始化数据库
int unqlite_db_init(const char *path, UnqliteDB **db_out) {
    if (!path || !db_out) return -1;

    make_dir(path);

    UnqliteDB *db = (UnqliteDB*)malloc(sizeof(UnqliteDB));
    if (!db) return -1;

    snprintf(db->path, sizeof(db->path), "%s/data.kv", path);

    int rc = unqlite_open(&db->db, db->path, UNQLITE_OPEN_CREATE);
    if (rc != UNQLITE_OK) {
        free(db);
        return rc;
    }

    *db_out = db;
    return 0;
}

// 执行 Jx9 脚本命令
int unqlite_db_exec(UnqliteDB *db, const char *cmd) {
    if (!db || !cmd) return -1;

    unqlite_vm *pVm;
    int rc = unqlite_compile(db->db, cmd, strlen(cmd), &pVm);
    if (rc != UNQLITE_OK) return rc;

    rc = unqlite_vm_exec(pVm);
    unqlite_vm_release(pVm);

    return (rc == UNQLITE_OK) ? 0 : rc;
}

// KV 操作 - 写入
int unqlite_db_put(UnqliteDB *db, const char *key, const char *value) {
    if (!db || !key || !value) return -1;
    int rc = unqlite_kv_store(db->db, key, strlen(key), value, strlen(value));
    return (rc == UNQLITE_OK) ? 0 : rc;
}

// KV 操作 - 读取
int unqlite_db_get(UnqliteDB *db, const char *key, char **value) {
    if (!db || !key || !value) return -1;

    unqlite_int64 len = 0;
    // 获取长度
    int rc = unqlite_kv_fetch(db->db, key, strlen(key), NULL, &len);
    if (rc != UNQLITE_OK || len <= 0) return -1;

    *value = (char*)malloc((size_t)len + 1);
    if (!*value) return -1;

    rc = unqlite_kv_fetch(db->db, key, strlen(key), *value, &len);
    if (rc != UNQLITE_OK) {
        free(*value);
        *value = NULL;
        return rc;
    }

    (*value)[(size_t)len] = '\0';
    return 0;
}

// KV 操作 - 删除
int unqlite_db_delete(UnqliteDB *db, const char *key) {
    if (!db || !key) return -1;
    int rc = unqlite_kv_delete(db->db, key, strlen(key));
    return (rc == UNQLITE_OK) ? 0 : rc;
}

// 关闭数据库
void unqlite_db_close(UnqliteDB *db) {
    if (!db) return;
    if (db->db) {
        unqlite_close(db->db);
        db->db = NULL;
    }
    free(db);
}
