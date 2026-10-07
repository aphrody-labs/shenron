// SPDX-License-Identifier: Apache-2.0
use std::{fs, process::Command};

#[test]
fn inventory_cli_prints_json_and_writes_requested_report() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("game");
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::write(root.join("bin/DBXV2.EXE"), b"synthetic executable").unwrap();
    fs::write(root.join("data.cpk"), b"synthetic archive data").unwrap();

    let stdout = Command::new(env!("CARGO_BIN_EXE_shenron-re"))
        .arg("inventory")
        .arg(&root)
        .output()
        .unwrap();
    assert!(stdout.status.success());
    let printed: serde_json::Value = serde_json::from_slice(&stdout.stdout).unwrap();
    assert_eq!(printed["scan"]["fileCount"], 2);
    assert_eq!(
        printed["files"][0]["sha256"],
        "eb4ffe43c9edcf310dc3513998df4fa1700fc6570c6c46e32dd3af9e028fe720"
    );

    let report_path = temp.path().join("map.json");
    let written = Command::new(env!("CARGO_BIN_EXE_shenron-re"))
        .arg("inventory")
        .arg(&root)
        .arg("--output")
        .arg(&report_path)
        .output()
        .unwrap();
    assert!(written.status.success());
    let report: serde_json::Value =
        serde_json::from_slice(&fs::read(report_path).unwrap()).unwrap();
    assert_eq!(report, printed);
}
