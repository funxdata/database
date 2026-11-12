use database::utils::cjson::{write_error, write_json_out, write_success, MAX_JSON_OUT};
use serde_json::json;
use std::ffi::{c_char, CStr};

fn read_buffer(buffer: &[u8]) -> serde_json::Value {
    let text = unsafe { CStr::from_ptr(buffer.as_ptr() as *const c_char) }
        .to_str()
        .expect("UTF-8");
    serde_json::from_str(text).expect("JSON")
}

#[test]
fn success_envelope_is_written() {
    let mut buffer = vec![0u8; MAX_JSON_OUT];
    let rc = write_success(
        buffer.as_mut_ptr() as *mut c_char,
        "success",
        json!({ "id": 1 }),
    );

    assert_eq!(rc, 0);
    let value = read_buffer(&buffer);
    assert_eq!(value["code"], 200);
    assert_eq!(value["msg"], "success");
    assert_eq!(value["data"]["id"], 1);
}

#[test]
fn error_envelope_is_written() {
    let mut buffer = vec![0u8; MAX_JSON_OUT];
    let rc = write_error(
        buffer.as_mut_ptr() as *mut c_char,
        400104,
        "sql is required",
    );

    assert_eq!(rc, 0);
    let value = read_buffer(&buffer);
    assert_eq!(value["code"], 400104);
    assert_eq!(value["msg"], "sql is required");
    assert_eq!(value["data"], json!({}));
}

#[test]
fn null_output_returns_minus_one() {
    let rc = write_json_out(std::ptr::null_mut(), json!({}));
    assert_eq!(rc, -1);
}

#[test]
fn oversized_payload_returns_minus_two() {
    let mut buffer = vec![0u8; MAX_JSON_OUT];
    let payload = "x".repeat(MAX_JSON_OUT);
    let rc = write_json_out(buffer.as_mut_ptr() as *mut c_char, json!(payload));
    assert_eq!(rc, -2);
}
