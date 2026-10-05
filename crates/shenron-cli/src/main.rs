// SPDX-License-Identifier: Apache-2.0
//! `shenron` binary: a thin facade over [`shenron_cli::run_async`].

fn main() {
    shenron_cli::install_tls_provider();
    let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("shenron: failed to start the async runtime: {error}");
            std::process::exit(70);
        },
    };
    let code = runtime.block_on(shenron_cli::run_async(std::env::args_os()));
    drop(runtime);
    std::process::exit(code);
}
