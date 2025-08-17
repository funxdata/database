#pragma once
#include <stddef.h>

typedef struct kvdb_t kvdb_t;

kvdb_t* kvdb_open(const char *path);
int kvdb_put(kvdb_t *db, const char *key, const char *value);
int kvdb_get(kvdb_t *db, const char *key, char **out);
int kvdb_delete(kvdb_t *db, const char *key);
void kvdb_close(kvdb_t *db);
