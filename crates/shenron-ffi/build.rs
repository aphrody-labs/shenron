// SPDX-License-Identifier: Apache-2.0
//! Build identity of the library (`shenron_build_info`): target triple, profile, enabled
//! features and the compiler that built it, read from the variables Cargo gives build scripts.

use std::process::Command;

fn main() {
    let target = std::env::var("TARGET").unwrap_or_else(|_| "unknown".to_owned());
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "unknown".to_owned());
    let rustc = std::env::var("RUSTC").unwrap_or_else(|_| "rustc".to_owned());
    let rustc_version = Command::new(&rustc)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map_or_else(|| "unknown".to_owned(), |text| text.trim().to_owned());
    let mut features: Vec<String> = std::env::vars()
        .filter_map(|(key, _)| {
            key.strip_prefix("CARGO_FEATURE_").map(|name| name.to_lowercase().replace('_', "-"))
        })
        .collect();
    features.sort();

    println!("cargo:rustc-env=SHENRON_FFI_TARGET={target}");
    println!("cargo:rustc-env=SHENRON_FFI_PROFILE={profile}");
    println!("cargo:rustc-env=SHENRON_FFI_RUSTC={rustc_version}");
    println!("cargo:rustc-env=SHENRON_FFI_FEATURES={}", features.join(","));
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=RUSTC");
}
