use rusqlite::Connection;
use rusqlite::types::ValueRef;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const DATABASE_DIR: &str = "./database";

pub struct FunxDB {
    conn: Connection,
}

impl FunxDB {
    pub fn open(name: &str) -> Result<Self, String> {
        fs::create_dir_all(DATABASE_DIR)
            .map_err(|e| e.to_string())?;

        let db_path =
            Path::new(DATABASE_DIR)
                .join(format!("{}.db", name));

        let conn =
            Connection::open(db_path)
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
                    .unwrap_or_else(|_| format!("col{}", i))  // 添加忽略参数修复编译错误
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
                                // 将字节转换为 UTF-8 字符串
                                json!(String::from_utf8_lossy(v).to_string())
                            }
                            ValueRef::Blob(v) => {
                                // 将 blob 转为 JSON 数组
                                json!(v.to_vec())
                            }
                        },
                        Err(_) => Value::Null, // 获取失败时返回 null
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