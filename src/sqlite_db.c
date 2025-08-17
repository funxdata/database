#include "sqlite_db.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>   // _mkdir
#define mkdir(path, mode) _mkdir(path)
#else
#include <sys/stat.h>
#include <sys/types.h>
#endif

// 递归创建目录
static void make_dir(const char *path) {
    char tmp[512];
    snprintf(tmp, sizeof(tmp), "%s", path);
    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/' || *p == '\\') {
            *p = 0;
            mkdir(tmp, 0755);
            *p = '/';
        }
    }
    mkdir(tmp, 0755);
}

int sqlite_db_init(SqliteDB *db, const char *name) {
    if (!db || !name) return -1;

    char dir_path[512];
    char file_path[512];

    snprintf(dir_path, sizeof(dir_path), "./db/sqldb/%s", name);
    snprintf(file_path, sizeof(file_path), "./db/sqldb/%s/%s.db", name, name);

    // 创建目录
    make_dir(dir_path);

    // 打开数据库
    if (sqlite3_open(file_path, &db->handle) != SQLITE_OK) {
        fprintf(stderr, "Can't open database: %s\n", sqlite3_errmsg(db->handle));
        return -1;
    }

    db->name = strdup(name);
    return 0;
}

int sqlite_db_exec(SqliteDB *db, const char *sql) {
    if (!db || !db->handle || !sql) return -1;

    char *errmsg = NULL;
    int rc = sqlite3_exec(db->handle, sql, 0, 0, &errmsg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "SQL error: %s\n", errmsg);
        sqlite3_free(errmsg);
        return -1;
    }
    return 0;
}

static int query_callback(void *data, int argc, char **argv, char **col_name) {
    (void)col_name; // unused
    char **result = (char **)data;
    size_t old_len = *result ? strlen(*result) : 0;
    size_t new_len = old_len + 256;

    *result = (char *)realloc(*result, new_len);
    if (!*result) return 1;

    (*result)[old_len] = 0;
    for (int i = 0; i < argc; i++) {
        strcat(*result, argv[i] ? argv[i] : "NULL");
        if (i < argc - 1) strcat(*result, ", ");
    }
    strcat(*result, "\n");
    return 0;
}

int sqlite_db_query(SqliteDB *db, const char *sql, char **result) {
    if (!db || !db->handle || !sql || !result) return -1;

    *result = NULL;
    char *errmsg = NULL;
    int rc = sqlite3_exec(db->handle, sql, query_callback, result, &errmsg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Query error: %s\n", errmsg);
        sqlite3_free(errmsg);
        return -1;
    }
    return 0;
}

void sqlite_db_close(SqliteDB *db) {
    if (db && db->handle) {
        sqlite3_close(db->handle);
        db->handle = NULL;
    }
    if (db && db->name) {
        free(db->name);
        db->name = NULL;
    }
}

