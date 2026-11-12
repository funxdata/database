use database::db::sqlite::{close_cached, FunxDB};
use serde_json::json;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

/// 生成本次测试专用的库名，避免并行测试互相干扰。
fn unique_name(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    format!("{}_{}_{}", prefix, std::process::id(), nanos)
}

fn cleanup(name: &str) {
    for suffix in ["", "-wal", "-shm"] {
        let _ = fs::remove_file(format!("./database/{}.db{}", name, suffix));
    }
}

struct TempDb {
    name: String,
}

impl TempDb {
    fn new(prefix: &str) -> Self {
        Self {
            name: unique_name(prefix),
        }
    }

    fn open(&self) -> FunxDB {
        FunxDB::open(&self.name).expect("open database")
    }
}

impl Drop for TempDb {
    fn drop(&mut self) {
        close_cached(&self.name);
        cleanup(&self.name);
    }
}

#[test]
fn crud_roundtrip() {
    let temp = TempDb::new("it_crud");
    let db = temp.open();

    db.create_table("users", "id INTEGER PRIMARY KEY, name TEXT, age INTEGER")
        .expect("create table");

    db.insert("INSERT INTO users (id, name, age) VALUES (1, 'tom', 18)")
        .expect("insert");

    let rows = db
        .query("SELECT id, name, age FROM users ORDER BY id")
        .expect("query");
    let rows = rows.as_array().expect("rows array");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["id"], 1);
    assert_eq!(rows[0]["name"], "tom");
    assert_eq!(rows[0]["age"], 18);

    db.update("UPDATE users SET age = 19 WHERE id = 1")
        .expect("update");
    let rows = db
        .query("SELECT age FROM users WHERE id = 1")
        .expect("query");
    assert_eq!(rows[0]["age"], 19);

    db.delete("DELETE FROM users WHERE id = 1").expect("delete");
    let rows = db.query("SELECT * FROM users").expect("query");
    assert_eq!(rows.as_array().expect("rows array").len(), 0);
}

#[test]
fn query_type_mapping() {
    let temp = TempDb::new("it_types");
    let db = temp.open();

    db.create_table(
        "samples",
        "id INTEGER PRIMARY KEY, txt TEXT, num REAL, payload BLOB",
    )
    .expect("create table");
    db.insert("INSERT INTO samples (id, txt, num, payload) VALUES (1, 'hello', 1.5, x'0102')")
        .expect("insert");

    let rows = db
        .query("SELECT id, txt, num, payload, NULL AS missing FROM samples")
        .expect("query");
    let row = &rows[0];
    assert_eq!(row["id"], 1);
    assert_eq!(row["txt"], "hello");
    assert_eq!(row["num"], 1.5);
    assert_eq!(row["payload"], json!([1, 2]));
    assert!(row["missing"].is_null());
}

#[test]
fn invalid_sql_returns_error() {
    let temp = TempDb::new("it_invalid");
    let db = temp.open();

    assert!(db.query("SELECT * FROM table_that_does_not_exist").is_err());
    assert!(db.insert("INSERT INTO missing VALUES (1)").is_err());
}

#[test]
fn empty_result_is_empty_array() {
    let temp = TempDb::new("it_empty");
    let db = temp.open();

    db.create_table("items", "id INTEGER PRIMARY KEY")
        .expect("create table");
    let rows = db.query("SELECT * FROM items").expect("query");
    assert_eq!(rows, json!([]));
}

#[test]
fn invalid_database_names_are_rejected() {
    for name in ["", "../x", "/etc/passwd", "C:\\x", "a/b", "a.b"] {
        assert!(
            FunxDB::open(name).is_err(),
            "database name should be rejected: {name:?}"
        );
    }
}

#[test]
fn invalid_table_name_is_rejected() {
    let temp = TempDb::new("it_table_name");
    let db = temp.open();

    for table in ["bad name", "1abc", "x; DROP TABLE y", ""] {
        assert!(
            db.create_table(table, "id INTEGER PRIMARY KEY").is_err(),
            "table name should be rejected: {table:?}"
        );
    }
}

#[test]
fn foreign_keys_are_enforced() {
    let temp = TempDb::new("it_fk");
    let db = temp.open();

    db.create_table("parents", "id INTEGER PRIMARY KEY")
        .expect("create parents");
    db.create_table(
        "children",
        "id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id)",
    )
    .expect("create children");

    assert!(db
        .insert("INSERT INTO children (id, parent_id) VALUES (1, 999)")
        .is_err());
}

#[test]
fn reserved_word_table_name_is_supported() {
    let temp = TempDb::new("it_reserved");
    let db = temp.open();

    db.create_table("order", "id INTEGER PRIMARY KEY, name TEXT")
        .expect("create reserved table");
    db.insert("INSERT INTO \"order\" (id, name) VALUES (1, 'x')")
        .expect("insert");
    let rows = db.query("SELECT name FROM \"order\"").expect("query");
    assert_eq!(rows[0]["name"], "x");
}

#[test]
fn multiple_statements_are_rejected() {
    let temp = TempDb::new("it_multi");
    let db = temp.open();

    assert!(db.query("SELECT 1; SELECT 2").is_err());
}

#[test]
fn unicode_and_long_text_roundtrip() {
    let temp = TempDb::new("it_text");
    let db = temp.open();

    db.create_table("texts", "id INTEGER PRIMARY KEY, body TEXT")
        .expect("create table");
    let body = format!("你好，database-{}", "x".repeat(10_000));
    db.insert(&format!(
        "INSERT INTO texts (id, body) VALUES (1, '{}')",
        body
    ))
    .expect("insert");
    let rows = db
        .query("SELECT body FROM texts WHERE id = 1")
        .expect("query");
    assert_eq!(rows[0]["body"], body);
}

#[test]
fn duplicate_column_names_last_one_wins() {
    let temp = TempDb::new("it_dup_col");
    let db = temp.open();

    let rows = db.query("SELECT 1 AS x, 2 AS x").expect("query");
    assert_eq!(rows[0]["x"], 2);
}

#[test]
fn invalid_schema_does_not_affect_existing_data() {
    let temp = TempDb::new("it_schema");
    let db = temp.open();

    db.create_table("good", "id INTEGER PRIMARY KEY, name TEXT")
        .expect("create good table");
    db.insert("INSERT INTO good (id, name) VALUES (1, 'ok')")
        .expect("insert");

    assert!(db
        .create_table("bad_schema", "id INTEGER, id TEXT")
        .is_err());

    let rows = db.query("SELECT name FROM good").expect("query");
    assert_eq!(rows[0]["name"], "ok");
}

#[test]
fn concurrent_writes_are_accepted() {
    let temp = TempDb::new("it_concurrent");
    {
        let db = temp.open();
        db.create_table("items", "id INTEGER PRIMARY KEY, worker INTEGER")
            .expect("create table");
    }

    let mut handles = Vec::new();
    for worker in 0..2 {
        let name = temp.name.clone();
        handles.push(std::thread::spawn(move || {
            let db = FunxDB::open(&name).expect("open in worker");
            for i in 0..20 {
                let id = worker * 100 + i;
                db.insert(&format!(
                    "INSERT INTO items (id, worker) VALUES ({}, {})",
                    id, worker
                ))
                .expect("insert");
            }
        }));
    }

    for handle in handles {
        handle.join().expect("join worker");
    }

    let db = temp.open();
    let rows = db.query("SELECT COUNT(*) AS n FROM items").expect("query");
    assert_eq!(rows[0]["n"], 40);
}
