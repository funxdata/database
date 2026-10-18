use once_cell::sync::Lazy;
use rusqlite::ffi::sqlite3_auto_extension;
use rusqlite::Connection;
use rusqlite::types::ValueRef;
use serde_json::{json, Value};
use sqlite_vec::sqlite3_vec_init;
use std::fs;
use std::path::Path;

const DATABASE_DIR: &str = "./database";

/// 全局注册 sqlite-vec 扩展，进程内只执行一次。
/// 注册后，后续所有 Connection 都会自动加载 vec0 功能。
static INIT_VEC: Lazy<()> = Lazy::new(|| {
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite3_vec_init as *const (),
        )));
    }
});

pub struct FunxDB {
    pub(crate) conn: Connection,
}

impl FunxDB {
    pub fn open(name: &str) -> Result<Self, String> {
        // 必须在 Connection::open 之前注册
        Lazy::force(&INIT_VEC);

        fs::create_dir_all(DATABASE_DIR)
            .map_err(|e| e.to_string())?;

        let db_path =
            Path::new(DATABASE_DIR)
                .join(format!("{}.db", name));

        let conn =
            Connection::open(db_path)
                .map_err(|e| e.to_string())?;

        // WAL：写不阻塞读，显著提升逐条写入吞吐
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;

        // NORMAL：fsync 只在 checkpoint 时发生，而非每次写入
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| e.to_string())?;

        Ok(Self { conn })
    }

    pub fn create_table(
        &self,
        table: &str,
        schema: &str,
    ) -> Result<(), String> {
        let sql = format!(
            "CREATE TABLE IF NOT EXISTS {} ({})",
            table,
            schema
        );

        self.conn
            .execute(&sql, [])
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn insert(
        &self,
        sql: &str,
    ) -> Result<(), String> {
        self.conn
            .execute(sql, [])
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn update(
        &self,
        sql: &str,
    ) -> Result<(), String> {
        self.conn
            .execute(sql, [])
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn delete(
        &self,
        sql: &str,
    ) -> Result<(), String> {
        self.conn
            .execute(sql, [])
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn query(
        &self,
        sql: &str,
    ) -> Result<Value, String> {
        let mut stmt =
            self.conn
                .prepare(sql)
                .map_err(|e| e.to_string())?;

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

                for i in 0..col_count {
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

                    obj.insert(column_names[i].clone(), json_val);
                }

                Ok(Value::Object(obj))
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();

        for row in rows {
            result.push(
                row.map_err(|e| e.to_string())?
            );
        }

        Ok(json!(result))
    }
}
