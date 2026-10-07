// SPDX-License-Identifier: Apache-2.0
//! C ABI / FFI entrypoints for `shenron-re`.
//!
//! Exposes the pure Rust reverse engineering engine to Bun (`bun:ffi`), C, and foreign runtimes.

#![allow(
    clippy::missing_safety_doc,
    reason = "C ABI FFI boundary with explicit safety contracts"
)]

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr;
use std::slice;

use crate::catalog::get_dragon_ball_catalog;
use crate::formats::{
    bac::BacFile,
    bdm::BdmFile,
    cus::CusFile,
    msg::MsgFile,
    pup::PupFile,
    sav::Dxbv2Save,
};
use crate::fs::cpk::CpkArchive;

/// Current ABI version for `shenron-re` FFI.
pub const SHENRON_RE_ABI_VERSION: u32 = 1;

fn to_c_string<T: serde::Serialize>(val: &T) -> *mut c_char {
    match serde_json::to_string(val) {
        Ok(s) => match CString::new(s) {
            Ok(c) => c.into_raw(),
            Err(_) => ptr::null_mut(),
        },
        Err(e) => {
            let err_json = format!(r#"{{"error":"{}"}}"#, e);
            CString::new(err_json).map(|c| c.into_raw()).unwrap_or(ptr::null_mut())
        }
    }
}

fn err_to_c_string(msg: &str) -> *mut c_char {
    let err_json = format!(r#"{{"error":"{}"}}"#, msg.replace('"', "\\\""));
    CString::new(err_json).map(|c| c.into_raw()).unwrap_or(ptr::null_mut())
}

/// Returns the C ABI version of the shenron-re library.
#[unsafe(no_mangle)]
pub extern "C" fn shenron_re_abi_version() -> u32 {
    SHENRON_RE_ABI_VERSION
}

/// Returns the crate version string. Caller must not free this static pointer.
#[unsafe(no_mangle)]
pub extern "C" fn shenron_re_version() -> *const c_char {
    static VERSION_C: &[u8] = concat!(env!("CARGO_PKG_VERSION"), "\0").as_bytes();
    VERSION_C.as_ptr() as *const c_char
}

/// Deallocates a C string allocated by `shenron-re`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

/// Deallocates a byte buffer allocated by `shenron-re`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_free_bytes(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        unsafe {
            let s = slice::from_raw_parts_mut(ptr, len);
            drop(Box::from_raw(s as *mut [u8]));
        }
    }
}

/// Inspects binary bytes (PE header, entropy, size) and returns a JSON string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_triage_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len == 0 {
        return err_to_c_string("Empty or null buffer provided for triage");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    let is_pe = slice.starts_with(b"MZ");
    let is_cpk = slice.starts_with(b"CPK ");
    let is_sav = slice.starts_with(b"#SAV") || (slice.len() >= 4 && u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]) == crate::formats::sav::ENCRYPTED_SAV_SIGNATURE);

    #[derive(serde::Serialize)]
    struct TriageReport {
        size_bytes: usize,
        is_pe: bool,
        is_cpk: bool,
        is_sav: bool,
    }

    to_c_string(&TriageReport {
        size_bytes: len,
        is_pe,
        is_cpk,
        is_sav,
    })
}

/// Lists all files in a CPK archive as a JSON array of entries.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_cpk_list_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len < 16 {
        return err_to_c_string("CPK buffer too small or null");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    match CpkArchive::parse(slice) {
        Ok(archive) => to_c_string(&archive.entries),
        Err(e) => err_to_c_string(&e.to_string()),
    }
}

/// Extracts a single file from a CPK archive by filename.
/// Returns pointer to extracted bytes, and sets `out_len`. Caller must free with `shenron_re_free_bytes`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_cpk_extract(
    archive_ptr: *const u8,
    archive_len: usize,
    filename_ptr: *const c_char,
    out_len: *mut usize,
) -> *mut u8 {
    if archive_ptr.is_null() || archive_len == 0 || filename_ptr.is_null() || out_len.is_null() {
        return ptr::null_mut();
    }
    let c_str = unsafe { CStr::from_ptr(filename_ptr) };
    let filename = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return ptr::null_mut(),
    };

    let slice = unsafe { slice::from_raw_parts(archive_ptr, archive_len) };
    let archive = match CpkArchive::parse(slice) {
        Ok(a) => a,
        Err(_) => return ptr::null_mut(),
    };

    match archive.extract(slice, filename) {
        Ok(extracted) => {
            let len = extracted.len();
            let boxed = extracted.into_boxed_slice();
            let raw_ptr = Box::into_raw(boxed) as *mut u8;
            unsafe {
                *out_len = len;
            }
            raw_ptr
        }
        Err(_) => ptr::null_mut(),
    }
}

/// Parses a BAC moveset binary and returns moves as JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_bac_parse_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len == 0 {
        return err_to_c_string("BAC buffer is null or empty");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    match BacFile::parse(slice) {
        Ok(bac) => to_c_string(&bac),
        Err(e) => err_to_c_string(&e.to_string()),
    }
}

/// Parses a BDM damage binary and returns hits as JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_bdm_parse_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len == 0 {
        return err_to_c_string("BDM buffer is null or empty");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    match BdmFile::parse(slice) {
        Ok(bdm) => to_c_string(&bdm),
        Err(e) => err_to_c_string(&e.to_string()),
    }
}

/// Parses a CUS skill table binary and returns skills as JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_cus_parse_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len == 0 {
        return err_to_c_string("CUS buffer is null or empty");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    match CusFile::parse(slice) {
        Ok(cus) => to_c_string(&cus),
        Err(e) => err_to_c_string(&e.to_string()),
    }
}

/// Parses a PUP transformation multiplier binary and returns entries as JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_pup_parse_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len == 0 {
        return err_to_c_string("PUP buffer is null or empty");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    match PupFile::parse(slice) {
        Ok(pup) => to_c_string(&pup),
        Err(e) => err_to_c_string(&e.to_string()),
    }
}

/// Parses a MSG localized text binary and returns messages as JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_msg_parse_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len == 0 {
        return err_to_c_string("MSG buffer is null or empty");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    match MsgFile::parse(slice) {
        Ok(msg) => to_c_string(&msg),
        Err(e) => err_to_c_string(&e.to_string()),
    }
}

/// Parses a DBXV2 savegame body and returns CaCs and globals as JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shenron_re_sav_parse_json(data: *const u8, len: usize) -> *mut c_char {
    if data.is_null() || len == 0 {
        return err_to_c_string("Save buffer is null or empty");
    }
    let slice = unsafe { slice::from_raw_parts(data, len) };
    match Dxbv2Save::parse_decrypted(slice) {
        Ok(sav) => to_c_string(&sav),
        Err(e) => err_to_c_string(&e.to_string()),
    }
}

/// Returns the built-in Dragon Ball video game catalog as JSON.
#[unsafe(no_mangle)]
pub extern "C" fn shenron_re_catalog_json() -> *mut c_char {
    let catalog = get_dragon_ball_catalog();
    to_c_string(&catalog)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ffi_version_and_abi() {
        assert_eq!(shenron_re_abi_version(), 1);
        let v_ptr = shenron_re_version();
        assert!(!v_ptr.is_null());
        let v_str = unsafe { CStr::from_ptr(v_ptr) }.to_str().unwrap();
        assert_eq!(v_str, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn test_ffi_triage() {
        let mock_data = b"MZ\x90\x00\x03\x00\x00\x00";
        let c_str_ptr = unsafe { shenron_re_triage_json(mock_data.as_ptr(), mock_data.len()) };
        assert!(!c_str_ptr.is_null());
        let res_str = unsafe { CStr::from_ptr(c_str_ptr) }.to_str().unwrap();
        assert!(res_str.contains(r#""is_pe":true"#));
        unsafe {
            shenron_re_free_string(c_str_ptr);
        }
    }
}
