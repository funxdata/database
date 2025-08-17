#include "gtest/gtest.h"
#include "database.h"
#include <cstdlib>
#include <cstring>


TEST(DatabaseTest, KVDBPutGetDelete) {
    Database db;
    ASSERT_EQ(database_init(&db, DB_KVDB, "test_kvdb"), 0);

    ASSERT_EQ(database_kvdb_put(&db, "key1", "value1"), 0);

    char *value = NULL;
    ASSERT_EQ(database_kvdb_get(&db, "key1", &value), 0);
    ASSERT_STREQ(value, "value1");
    free(value);

    ASSERT_EQ(database_kvdb_delete(&db, "key1"), 0);

    database_close(&db);
}

TEST(DatabaseTest, SQLiteExecQuery) {
    Database db;
    ASSERT_EQ(database_init(&db, DB_SQLITE, "test_sqlite.db"), 0);

    ASSERT_EQ(database_exec(&db, "CREATE TABLE IF NOT EXISTS test(id INTEGER PRIMARY KEY, name TEXT);"), 0);
    ASSERT_EQ(database_exec(&db, "INSERT INTO test(name) VALUES('Bob');"), 0);

    char *result = NULL;
    ASSERT_EQ(database_query(&db, "SELECT name FROM test WHERE id=1;", &result), 0);
    ASSERT_NE(result, nullptr);
    free(result);

    database_close(&db);
}

TEST(DatabaseTest, UnQLitePutGet) {
    Database db;
    ASSERT_EQ(database_init(&db, DB_UNQLITE, "test_unqlite"), 0);

    ASSERT_EQ(database_exec(&db, "SET mykey = 'Hello';"), 0);

    char *result = NULL;
    ASSERT_EQ(database_query(&db, "mykey", &result), 0);
    ASSERT_STREQ(result, "Hello");
    free(result);

    database_close(&db);
}
