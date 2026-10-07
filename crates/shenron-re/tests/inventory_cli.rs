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

#[test]
fn text_cli_extracts_msg_strings_without_overwriting_existing_files() {
    let temp = tempfile::tempdir().unwrap();
    let input = temp.path().join("quest.msg");
    let mut bytes = vec![0, 0];
    bytes.extend("Hello".encode_utf16().flat_map(u16::to_le_bytes));
    bytes.extend([0, 0]);
    bytes.extend("日文".encode_utf16().flat_map(u16::to_le_bytes));
    fs::write(&input, bytes).unwrap();

    let printed =
        Command::new(env!("CARGO_BIN_EXE_shenron-re")).arg("text").arg(&input).output().unwrap();
    assert!(printed.status.success());
    let report: serde_json::Value = serde_json::from_slice(&printed.stdout).unwrap();
    assert_eq!(report["file"], "quest.msg");
    assert_eq!(report["count"], 1);
    assert_eq!(report["strings"], serde_json::json!(["Hello"]));

    let output = temp.path().join("quest.msg.json");
    let written = Command::new(env!("CARGO_BIN_EXE_shenron-re"))
        .arg("text")
        .arg(&input)
        .arg("--output")
        .arg(&output)
        .output()
        .unwrap();
    assert!(written.status.success());
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&fs::read(&output).unwrap()).unwrap(),
        report
    );

    let refused = Command::new(env!("CARGO_BIN_EXE_shenron-re"))
        .arg("text")
        .arg(&input)
        .arg("--output")
        .arg(&output)
        .output()
        .unwrap();
    assert!(!refused.status.success());
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&fs::read(output).unwrap()).unwrap(),
        report
    );
}
