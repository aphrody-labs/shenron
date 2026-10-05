// SPDX-License-Identifier: Apache-2.0
//! Cancellation of a real network job: a RAG search against a backend that accepts the
//! connection and never answers returns `Status::Cancelled` as soon as it is cancelled, from
//! another thread, long before the HTTP client's own timeout. Its own test binary: it sets
//! process environment variables.

#![cfg(not(target_arch = "wasm32"))]

use std::{
    ffi::{CStr, CString},
    net::TcpListener,
    time::{Duration, Instant},
};

use shenron_ffi::{
    abi::Status, shenron_cancel, shenron_job_count, shenron_job_new, shenron_rag_search_job,
    shenron_string_free,
};

#[test]
fn a_hung_rag_search_is_cancelled_promptly() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    // Accept and hold every connection without ever answering.
    std::thread::spawn(move || {
        let mut held = Vec::new();
        for stream in listener.incoming().flatten() {
            held.push(stream);
        }
    });
    // SAFETY: the only test of this binary; no other thread reads the environment yet.
    unsafe {
        std::env::set_var("SHENRON_API_URL", format!("http://{address}"));
        std::env::set_var("RAG_BACKEND", "local");
    }

    let job = shenron_job_new();
    let worker = std::thread::spawn(move || {
        let query = CString::new("Son Goku").unwrap();
        let ptr = unsafe { shenron_rag_search_job(job, query.as_ptr(), 3, std::ptr::null()) };
        assert!(!ptr.is_null());
        let text = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned();
        unsafe { shenron_string_free(ptr) };
        (text, Instant::now())
    });
    std::thread::sleep(Duration::from_millis(300));
    assert!(!worker.is_finished(), "the backend never answers: the search must still wait");
    let cancelled_at = Instant::now();
    assert!(shenron_cancel(job));
    let (text, returned_at) = worker.join().unwrap();
    let latency = returned_at.duration_since(cancelled_at);

    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(value["status"], Status::Cancelled.code(), "{value}");
    assert!(latency < Duration::from_secs(1), "returned {latency:?} after the cancellation");
    assert_eq!(shenron_job_count(), 0, "the job left the registry");
    println!("rag_search_job cancellation latency: {latency:?}");
}
