#include "../include/database.h"
#include <stdio.h>
#include <stdlib.h>

int main() {
    Database db;

    // --------------------------
    // 测试 SQLite
    // --------------------------
    if (database_init(&db, DB_SQLITE, "test_sqlite.db") != 0) {
        printf("Failed to init SQLite\n");
        return -1;
    }

    database_exec(&db, "CREATE TABLE IF NOT EXISTS test(id INTEGER PRIMARY KEY, name TEXT);");
    database_exec(&db, "INSERT INTO test(name) VALUES('Alice');");

    char *result = NULL;
    database_query(&db, "SELECT name FROM test WHERE id=1;", &result);
    if (result) {
        printf("[SQLite] Query result: %s\n", result);
        free(result);
    }

    database_close(&db);

    // --------------------------
    // 测试 UnQLite (KV)
    // --------------------------
    if (database_init(&db, DB_UNQLITE, "test_unqlite") != 0) {
        printf("Failed to init UnQLite\n");
        return -1;
    }

    database_exec(&db, "SET mykey = 'Hello UnQLite';");

    result = NULL;
    database_query(&db, "mykey", &result);  // 对应封装的查询接口
    if (result) {
        printf("[UnQLite] Query result: %s\n", result);
        free(result);
    }

    database_close(&db);

    // --------------------------
    // 测试简单 KVDB
    // --------------------------
    if (database_init(&db, DB_KVDB, "test_kvdb") != 0) {
        printf("Failed to init KVDB\n");
        return -1;
    }

    database_kvdb_put(&db, "k1", "value1");
    database_kvdb_put(&db, "k2", "value2");

    result = NULL;
    if (database_kvdb_get(&db, "k1", &result) == 0 && result) {
        printf("[KVDB] k1 = %s\n", result);
        free(result);
    }

    database_kvdb_delete(&db, "k2");

    database_close(&db);

    return 0;
}
