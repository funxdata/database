#include "../include/kv_db.h"

#include "khash.h"
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <stdio.h>
#ifdef _WIN32
#include  "../crates/dirent/include/dirent.h"  // _mkdir
#define mkdir(path, mode) _mkdir(path)
#else
#include <sys/stat.h>
#include <sys/types.h>
#endif

#define KVDB_MAX_FILE_SIZE (1024 * 1024) // 1MB

KHASH_MAP_INIT_STR(str, char*)

struct kvdb_t {
    khash_t(str) *h;
    char dir[256];
    FILE *cur_fp;
    char cur_file[256];
};

// 工具：确保目录存在
static void ensure_dir(const char *path) {
#ifdef _WIN32
    _mkdir(path);
#else
    mkdir(path, 0755);
#endif
}

// 获取新文件名
static void new_data_file(kvdb_t *db) {
    time_t t = time(NULL);
    snprintf(db->cur_file, sizeof(db->cur_file), "%s/%ld.kv", db->dir, t);
    if (db->cur_fp) fclose(db->cur_fp);
    db->cur_fp = fopen(db->cur_file, "a+");
}

// 检查当前文件大小是否超过1MB
static void check_rotate(kvdb_t *db) {
    if (!db->cur_fp) return;
    fseek(db->cur_fp, 0, SEEK_END);
    long size = ftell(db->cur_fp);
    if (size >= KVDB_MAX_FILE_SIZE) {
        new_data_file(db);
    }
}

// 解析一行 "op key value"
static void apply_line(kvdb_t *db, char *line) {
    char op[8], key[256], value[256];
    if (sscanf(line, "%7s %255s %255[^\n]", op, key, value) >= 2) {
        if (strcmp(op, "PUT") == 0) {
            kvdb_put(db, key, value);
        } else if (strcmp(op, "DEL") == 0) {
            kvdb_delete(db, key);
        }
    }
}

// 从所有历史文件恢复
static void load_files(kvdb_t *db) {
    DIR *d = opendir(db->dir);
    if (!d) return;

    struct dirent *ent;
    while ((ent = readdir(d))) {
        if (strstr(ent->d_name, ".kv")) {
            char path[512];
            snprintf(path, sizeof(path), "%s/%s", db->dir, ent->d_name);
            FILE *fp = fopen(path, "r");
            if (!fp) continue;
            char buf[1024];
            while (fgets(buf, sizeof(buf), fp)) {
                apply_line(db, buf);
            }
            fclose(fp);
        }
    }
    closedir(d);
}

kvdb_t* kvdb_open(const char *path) {
    kvdb_t *db = malloc(sizeof(kvdb_t));
    if (!db) return NULL;
    db->h = kh_init(str);
    snprintf(db->dir, sizeof(db->dir), "%s", path);

    ensure_dir("./db");
    ensure_dir(path);

    load_files(db);          // 恢复历史数据
    new_data_file(db);       // 打开新文件
    return db;
}

int kvdb_put(kvdb_t *db, const char *key, const char *value) {
    if (!db || !key || !value) return -1;
    int ret;
    khiter_t k = kh_put(str, db->h, key, &ret);
    if (ret < 0) return -1;
    if (ret != 0) {
        kh_value(db->h, k) = strdup(value);
    } else {
        free(kh_value(db->h, k));
        kh_value(db->h, k) = strdup(value);
    }
    fprintf(db->cur_fp, "PUT %s %s\n", key, value);
    fflush(db->cur_fp);
    check_rotate(db);
    return 0;
}

int kvdb_get(kvdb_t *db, const char *key, char **out) {
    if (!db || !key || !out) return -1;
    khiter_t k = kh_get(str, db->h, key);
    if (k == kh_end(db->h)) {
        *out = NULL;
        return -1;
    }
    *out = strdup(kh_value(db->h, k));
    return 0;
}

int kvdb_delete(kvdb_t *db, const char *key) {
    if (!db || !key) return -1;
    khiter_t k = kh_get(str, db->h, key);
    if (k == kh_end(db->h)) return -1;
    free(kh_value(db->h, k));
    kh_del(str, db->h, k);
    fprintf(db->cur_fp, "DEL %s\n", key);
    fflush(db->cur_fp);
    check_rotate(db);
    return 0;
}

void kvdb_close(kvdb_t *db) {
    if (!db) return;
    khash_t(str)* h = db->h;
    for (khiter_t k = kh_begin(h); k != kh_end(h); ++k) {
        if (kh_exist(h, k)) {
            free(kh_value(h, k));
        }
    }
    kh_destroy(str, h);
    if (db->cur_fp) fclose(db->cur_fp);
    free(db);
}
