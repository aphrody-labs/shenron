// SPDX-License-Identifier: Apache-2.0

//! Unified Assembly Instruction Encoding, Disassembly, and Binary Triage Engine.
//!
//! Unifies:
//! - Canonical MSVC-dialect x86-64 instruction encoding from `aphrody-nie-asm`
//! - Fast instruction disassembly and formatted text output
//! - Format detection (PE32/PE64/ELF), section entropy analysis, and string triage from `aphrody-re`
//! - AOB memory pattern searching integrated with `shenron-re`

pub mod disasm;
pub mod encode;
pub mod insn;
pub mod text;
pub mod triage;

pub use disasm::{DisasmInsn, disassemble_x86_64};
pub use encode::{encode, encode_at};
pub use insn::{
    Alu, Cond, Insn, Mem, Reg, RepOp, Rm, Seg, ShiftOp, Size, SseOp, UnOp, VexOp, Xmm, XmmRm, Ymm,
    YmmRm,
};
pub use text::{ParseError, parse_insn, parse_line, to_line};
pub use triage::{
    BinaryFormat, SectionInfo, TriageReport, extract_strings, shannon_entropy, triage_binary,
};

/// Assembles a slice of instructions into machine code.
#[must_use]
pub fn assemble(insns: &[Insn], ip: u64) -> Vec<u8> {
    encode_at(insns, ip)
}

/// Disassembles machine code from raw bytes.
#[must_use]
pub fn disassemble(bytes: &[u8], ip: u64, limit: usize) -> Vec<DisasmInsn> {
    disassemble_x86_64(bytes, ip, limit)
}

use shenron_re::live::aob::AobPattern;

/// High-level Unified Assembly and Disassembly Triage Helper.
pub struct AsmTriageHelper;

impl AsmTriageHelper {
    /// Inspects and triages an arbitrary executable binary.
    #[must_use]
    pub fn triage(bytes: &[u8]) -> TriageReport {
        triage_binary(bytes)
    }

    /// Disassembles machine code instructions from raw bytes.
    #[must_use]
    pub fn disassemble(bytes: &[u8], ip: u64, limit: usize) -> Vec<DisasmInsn> {
        disassemble_x86_64(bytes, ip, limit)
    }

    /// Encodes a slice of structured instructions into raw machine code bytes.
    #[must_use]
    pub fn assemble(insns: &[Insn], ip: u64) -> Vec<u8> {
        encode_at(insns, ip)
    }

    /// Parses symbolic assembly text and compiles it directly into machine code.
    pub fn assemble_text(text: &str, ip: u64) -> Result<Vec<u8>, ParseError> {
        let insns = parse_line(text)?;
        Ok(encode_at(&insns, ip))
    }

    /// Scans a byte buffer for an Array-of-Bytes (AOB) wildcard pattern (e.g. `48 89 ?? 24`).
    pub fn scan_pattern(
        bytes: &[u8],
        pattern: &str,
    ) -> Result<Vec<usize>, shenron_re::error::ReError> {
        let aob = AobPattern::parse(pattern)?;
        Ok(aob.scan_all(bytes, usize::MAX))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asm_triage_helper_full_cycle() {
        // 1. Text to assembly
        let code =
            AsmTriageHelper::assemble_text("mov al, 1 ; ret", 0x140000000).expect("assemble");
        assert_eq!(code, vec![0xB0, 0x01, 0xC3]);

        // 2. Disassembly
        let dis = AsmTriageHelper::disassemble(&code, 0x140000000, 10);
        assert_eq!(dis.len(), 2);
        assert_eq!(dis[0].mnemonic, "mov");
        assert_eq!(dis[1].mnemonic, "ret");

        // 3. Pattern scan
        let hits = AsmTriageHelper::scan_pattern(&code, "B0 ?? C3").expect("aob scan");
        assert_eq!(hits, vec![0]);

        // 4. Binary triage
        let report = AsmTriageHelper::triage(&code);
        assert_eq!(report.size, 3);
        assert!(!report.sha256.is_empty());
    }
}
