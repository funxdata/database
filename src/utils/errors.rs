//! 统一业务码。数值属于 FFI 契约的一部分，不得随意改动。

pub const SUCCESS: i32 = 200;

pub const INVALID_JSON: i32 = 400101;
pub const MISSING_TABLE: i32 = 400102;
pub const MISSING_SCHEMA: i32 = 400103;
pub const MISSING_SQL: i32 = 400104;

pub const OPEN_FAILED: i32 = 500100;
pub const EXECUTE_FAILED: i32 = 500101;
