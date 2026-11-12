use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::rc::Rc;
use std::time::Duration;

const DATABASE_DIR: &str = "./database";
const MAX_NAME_LEN: usize = 64;
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

thread_local! {
    /// 每个线程按数据库路径缓存一条连接。
    /// 连接不跨线程共享（rusqlite::Connection 不是 Sync），并发调用时每个线程各自持有连接。
    static CONNECTIONS: RefCell<HashMap<String, Rc<Connection>>> = RefCell::new(HashMap::new());
}

pub struct FunxDB {
    key: String,
    conn: Rc<Connection>,
}

/// 校验逻辑库名：只允许 `[A-Za-z0-9_-]`，长度 1..=64。
/// `path` 是逻辑名，不是文件路径，禁止路径分隔符、`..` 与绝对路径。
pub fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > MAX_NAME_LEN {
        return Err(format!(
            "invalid database name: length must be 1..={}",
            MAX_NAME_LEN
        ));
    }

    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("invalid database name: only [A-Za-z0-9_-] is allowed".into());
    }

    Ok(())
}

fn validate_identifier(name: &str) -> Result<(), String> {
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return Err("invalid table name".into()),
    }

    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("invalid table name".into());
    }

    Ok(())
}

fn db_path(name: &str) -> String {
    Path::new(DATABASE_DIR)
        .join(format!("{}.db", name))
        .to_string_lossy()
        .into_owned()
}

/// 从当前线程缓存中移除指定数据库的连接。
/// 用于测试清理或需要主动关闭文件的场景。
pub fn close_cached(name: &str) {
    let key = db_path(name);
    CONNECTIONS.with(|cache| {
        cache.borrow_mut().remove(&key);
    });
}

impl FunxDB {
    pub fn open(name: &str) -> Result<Self, String> {
        validate_name(name)?;

        fs::create_dir_all(DATABASE_DIR).map_err(|e| e.to_string())?;

        let key = db_path(name);

        if let Some(conn) = CONNECTIONS.with(|cache| cache.borrow().get(&key).cloned()) {
            return Ok(Self { key, conn });
        }

        let conn = Connection::open(&key).map_err(|e| e.to_string())?;

        // 并发写冲突时等待而不是立即返回 SQLITE_BUSY
        conn.busy_timeout(BUSY_TIMEOUT).map_err(|e| e.to_string())?;

        // WAL：写不阻塞读，显著提升逐条写入吞吐
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;

        // NORMAL：fsync 只在 checkpoint 时发生，而非每次写入
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| e.to_string())?;

        // 默认开启外键约束
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;

        let conn = Rc::new(conn);
        CONNECTIONS.with(|cache| {
            cache.borrow_mut().insert(key.clone(), Rc::clone(&conn));
        });

        Ok(Self { key, conn })
    }

    /// 从当前线程缓存中移除自身连接。
    pub fn close(self) {
        CONNECTIONS.with(|cache| {
            cache.borrow_mut().remove(&self.key);
        });
    }

    pub fn create_table(&self, table: &str, schema: &str) -> Result<(), String> {
        validate_identifier(table)?;

        // 表名已通过白名单校验，这里再加引号以兼容保留字。
        let sql = format!("CREATE TABLE IF NOT EXISTS \"{}\" ({})", table, schema);

        self.conn.execute(&sql, []).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn insert(&self, sql: &str) -> Result<(), String> {
        self.conn.execute(sql, []).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn update(&self, sql: &str) -> Result<(), String> {
        self.conn.execute(sql, []).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn delete(&self, sql: &str) -> Result<(), String> {
        self.conn.execute(sql, []).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn query(&self, sql: &str) -> Result<Value, String> {
        let mut stmt = self.conn.prepare(sql).map_err(|e| e.to_string())?;

        let col_count = stmt.column_count();

        // 预先获取列名，若获取不到则使用 "col{i}" 作为后备
        let column_names: Vec<String> = (0..col_count)
            .map(|i| {
                stmt.column_name(i)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|_| format!("col{}", i))
            })
            .collect();

        let rows = stmt
            .query_map([], |row| {
                let mut obj = serde_json::Map::new();

                for (i, column_name) in column_names.iter().enumerate() {
                    // 根据列类型转换为合适的 JSON 值
                    let json_val = match row.get_ref(i) {
                        Ok(rv) => match rv {
                            ValueRef::Null => Value::Null,
                            ValueRef::Integer(v) => json!(v),
                            ValueRef::Real(v) => json!(v),
                            ValueRef::Text(v) => {
                                json!(String::from_utf8_lossy(v).to_string())
                            }
                            ValueRef::Blob(v) => {
                                json!(v.to_vec())
                            }
                        },
                        Err(_) => Value::Null,
                    };

                    obj.insert(column_name.clone(), json_val);
                }

                Ok(Value::Object(obj))
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();

        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }

        Ok(json!(result))
    }
}
