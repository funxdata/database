pub mod db;
pub mod utils;

pub use crate::utils::ffi::*;

/// 强制链接器保留所有 FFI 导出符号，避免 cdylib 下被死代码消除。
/// 这个函数不会被调用，仅用于让编译器“看到”这些符号被使用。
#[allow(dead_code)]
fn _force_export() {
    let _ = (
        crate::utils::ffi::post_db_create as *const (),
        crate::utils::ffi::post_db_insert as *const (),
        crate::utils::ffi::post_db_update as *const (),
        crate::utils::ffi::post_db_delete as *const (),
        crate::utils::ffi::post_db_query as *const (),
        crate::utils::ffi::post_db_vec_create as *const (),
        crate::utils::ffi::post_db_vec_insert as *const (),
        crate::utils::ffi::post_db_vec_insert_batch as *const (),
        crate::utils::ffi::post_db_vec_query as *const (),
    );
}
