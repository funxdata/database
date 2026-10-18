use crate::db::sqlite::FunxDB;
use rusqlite::params;
use serde_json::{json, Value};
use zerocopy::IntoBytes;

impl FunxDB {
    /// 创建向量表，维度固定。重复调用无副作用。
    pub fn create_vec_table(
        &self,
        table: &str,
        dimensions: usize,
    ) -> Result<(), String> {
        let sql = format!(
            "CREATE VIRTUAL TABLE IF NOT EXISTS {} USING vec0(embedding float[{}])",
            table, dimensions
        );
        self.conn
            .execute(&sql, [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 插入单条向量。rowid 由调用方指定。
    pub fn insert_vec(
        &self,
        table: &str,
        rowid: i64,
        embedding: &[f32],
    ) -> Result<(), String> {
        let sql = format!(
            "INSERT INTO {}(rowid, embedding) VALUES (?1, ?2)",
            table
        );
        self.conn
            .execute(&sql, params![rowid, embedding.as_bytes()])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 批量插入向量，单事务包裹，fsync 只发生一次。
    /// items: &[(rowid, embedding)]
    pub fn insert_vec_batch(
        &self,
        table: &str,
        items: &[(i64, Vec<f32>)],
    ) -> Result<(), String> {
        let sql = format!(
            "INSERT INTO {}(rowid, embedding) VALUES (?1, ?2)",
            table
        );
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        {
            let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
            for (rowid, embedding) in items {
                stmt.execute(params![rowid, embedding.as_slice().as_bytes()])
                    .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// KNN 查询，返回 [{ rowid, distance }, ...]，按距离升序。
    pub fn knn_query(
        &self,
        table: &str,
        query_embedding: &[f32],
        k: usize,
    ) -> Result<Value, String> {
        let sql = format!(
            "SELECT rowid, distance FROM {} WHERE embedding MATCH ?1 AND k = ?2 ORDER BY distance",
            table
        );
        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(
                params![query_embedding.as_bytes(), k as i64],
                |row| {
                    Ok(json!({
                        "rowid": row.get::<_, i64>(0)?,
                        "distance": row.get::<_, f64>(1)?,
                    }))
                },
            )
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
        Ok(json!(result))
    }
}
