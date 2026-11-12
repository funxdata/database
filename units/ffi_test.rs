use database::utils::cjson::MAX_JSON_OUT;
use serde_json::Value;
use std::ffi::{c_char, CStr, CString};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

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
}

impl Drop for TempDb {
    fn drop(&mut self) {
        database::db::sqlite::close_cached(&self.name);
        cleanup(&self.name);
    }
}

/// 调用一个 C ABI 导出函数，并解析响应 JSON。
fn call(request: &str, f: extern "C" fn(*const c_char, *mut c_char) -> i32) -> (i32, Value) {
    let input = CString::new(request).expect("request contains NUL");
    let mut output = vec![0u8; MAX_JSON_OUT];

    let rc = f(input.as_ptr(), output.as_mut_ptr() as *mut c_char);
    if rc != 0 {
        return (rc, Value::Null);
    }

    // SAFETY: 导出函数在成功时写入以 NUL 结尾的 UTF-8 JSON。
    let text = unsafe { CStr::from_ptr(output.as_ptr() as *const c_char) }
        .to_str()
        .expect("response is UTF-8");
    let value = serde_json::from_str(text).expect("response is JSON");
    (rc, value)
}

#[test]
fn ffi_crud_lifecycle() {
    let temp = TempDb::new("ffi_crud");
    let path = &temp.name;

    let create = format!(
        r#"{{"path":"{}","table":"users","schema":"id INTEGER PRIMARY KEY, name TEXT"}}"#,
        path
    );
    let (rc, res) = call(&create, database::db_create);
    assert_eq!(rc, 0);
    assert_eq!(res["code"], 200, "create response: {}", res);

    let insert = format!(
        r#"{{"path":"{}","sql":"INSERT INTO users (id, name) VALUES (1, 'tom')"}}"#,
        path
    );
    let (_, res) = call(&insert, database::db_insert);
    assert_eq!(res["code"], 200, "insert response: {}", res);

    let query = format!(
        r#"{{"path":"{}","sql":"SELECT id, name FROM users"}}"#,
        path
    );
    let (_, res) = call(&query, database::db_query);
    assert_eq!(res["code"], 200, "query response: {}", res);
    assert_eq!(res["data"][0]["name"], "tom");

    let update = format!(
        r#"{{"path":"{}","sql":"UPDATE users SET name = 'jerry' WHERE id = 1"}}"#,
        path
    );
    let (_, res) = call(&update, database::db_update);
    assert_eq!(res["code"], 200, "update response: {}", res);
    let (_, res) = call(&query, database::db_query);
    assert_eq!(res["data"][0]["name"], "jerry");

    let delete = format!(
        r#"{{"path":"{}","sql":"DELETE FROM users WHERE id = 1"}}"#,
        path
    );
    let (_, res) = call(&delete, database::db_delete);
    assert_eq!(res["code"], 200, "delete response: {}", res);
    let (_, res) = call(&query, database::db_query);
    assert_eq!(res["data"].as_array().expect("data array").len(), 0);
}

#[test]
fn ffi_validation_errors() {
    let temp = TempDb::new("ffi_errors");
    let path = &temp.name;

    let (_, res) = call("not-json", database::db_create);
    assert_eq!(res["code"], 400101);

    let missing_table = format!(r#"{{"path":"{}"}}"#, path);
    let (_, res) = call(&missing_table, database::db_create);
    assert_eq!(res["code"], 400102);

    let missing_sql = format!(r#"{{"path":"{}"}}"#, path);
    let (_, res) = call(&missing_sql, database::db_insert);
    assert_eq!(res["code"], 400104);
}

#[test]
fn ffi_null_output_returns_minus_one() {
    let temp = TempDb::new("ffi_null");
    let request = format!(r#"{{"path":"{}"}}"#, temp.name);
    let input = CString::new(request).expect("request contains NUL");

    let rc = database::db_create(input.as_ptr(), std::ptr::null_mut());
    assert_eq!(rc, -1);
}
