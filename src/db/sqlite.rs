use rusqlite::Connection;
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

        let rows = stmt
            .query_map([], |row| {
                let mut obj =
                    serde_json::Map::new();

                for i in 0..col_count {
                    let value: Result<String, _> =
                        row.get(i);

                    obj.insert(
                        format!("col{}", i),
                        json!(
                            value.unwrap_or_default()
                        ),
                    );
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

