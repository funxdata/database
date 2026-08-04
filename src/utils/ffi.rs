use crate::db::sqlite::FunxDB;
use crate::utils::cjson::{
    parse_json,
    write_error,
    write_success,
};

use safer_ffi::prelude::*;
use serde::Deserialize;
use serde_json::json;
use std::ffi::c_char;
use std::os::raw::c_int;

#[derive(Debug, Deserialize)]
struct DbReq {
    path: String,
    table: Option<String>,
    schema: Option<String>,
    sql: Option<String>,
}

// 使用 safer_ffi 导出函数
#[ffi_export]
fn post_db_create(
    json_in: *const c_char,
    json_out: *mut c_char,
) -> c_int {
    let req: DbReq =
        match parse_json(json_in) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    400101,
                    &e,
                )
            }
        };

    let db =
        match FunxDB::open(&req.path) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    500100,
                    &e,
                )
            }
        };

    let table =
        match req.table {
            Some(v) => v,
            None => {
                return write_error(
                    json_out,
                    400102,
                    "table is required",
                )
            }
        };

    let schema =
        match req.schema {
            Some(v) => v,
            None => {
                return write_error(
                    json_out,
                    400103,
                    "schema is required",
                )
            }
        };

    match db.create_table(
        &table,
        &schema,
    ) {
        Ok(_) => write_success(
            json_out,
            "success",
            json!({}),
        ),
        Err(e) => write_error(
            json_out,
            500101,
            &e,
        ),
    }
}

#[ffi_export]
fn post_db_insert(
    json_in: *const c_char,
    json_out: *mut c_char,
) -> c_int {
    execute_write(json_in, json_out)
}

#[ffi_export]
fn post_db_update(
    json_in: *const c_char,
    json_out: *mut c_char,
) -> c_int {
    execute_write(json_in, json_out)
}

#[ffi_export]
fn post_db_delete(
    json_in: *const c_char,
    json_out: *mut c_char,
) -> c_int {
    let req: DbReq =
        match parse_json(json_in) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    400101,
                    &e,
                )
            }
        };

    let db =
        match FunxDB::open(&req.path) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    500100,
                    &e,
                )
            }
        };

    let sql =
        match req.sql {
            Some(v) => v,
            None => {
                return write_error(
                    json_out,
                    400104,
                    "sql is required",
                )
            }
        };

    match db.delete(&sql) {
        Ok(_) => write_success(
            json_out,
            "success",
            json!({}),
        ),
        Err(e) => write_error(
            json_out,
            500101,
            &e,
        ),
    }
}

#[ffi_export]
fn post_db_query(
    json_in: *const c_char,
    json_out: *mut c_char,
) -> c_int {
    let req: DbReq =
        match parse_json(json_in) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    400101,
                    &e,
                )
            }
        };

    let db =
        match FunxDB::open(&req.path) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    500100,
                    &e,
                )
            }
        };

    let sql =
        match req.sql {
            Some(v) => v,
            None => {
                return write_error(
                    json_out,
                    400104,
                    "sql is required",
                )
            }
        };

    match db.query(&sql) {
        Ok(v) => write_success(
            json_out,
            "success",
            v,
        ),
        Err(e) => write_error(
            json_out,
            500101,
            &e,
        ),
    }
}

fn execute_write(
    json_in: *const c_char,
    json_out: *mut c_char,
) -> c_int {
    let req: DbReq =
        match parse_json(json_in) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    400101,
                    &e,
                )
            }
        };

    let db =
        match FunxDB::open(&req.path) {
            Ok(v) => v,
            Err(e) => {
                return write_error(
                    json_out,
                    500100,
                    &e,
                )
            }
        };

    let sql =
        match req.sql {
            Some(v) => v,
            None => {
                return write_error(
                    json_out,
                    400104,
                    "sql is required",
                )
            }
        };

    match db.insert(&sql) {
        Ok(_) => write_success(
            json_out,
            "success",
            json!({}),
        ),
        Err(e) => write_error(
            json_out,
            500101,
            &e,
        ),
    }
}