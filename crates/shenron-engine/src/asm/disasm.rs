// SPDX-License-Identifier: Apache-2.0

//! Lightweight, Pure-Rust x86-64 Instruction Disassembler.
//!
//! Provides deterministic instruction decoding from raw byte buffers
//! into structured [`DisasmInsn`] representations without external C or GPL dependencies.

use serde::{Deserialize, Serialize};

/// Disassembled instruction ready for serialization or display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisasmInsn {
    pub offset: u64,
    pub address: u64,
    pub bytes_hex: String,
    pub mnemonic: String,
    pub text: String,
}

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        let _ = write!(s, "{:02x}", b);
    }
    s
}

const REGS_64: [&str; 16] = [
    "rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi", "r8", "r9", "r10", "r11", "r12", "r13",
    "r14", "r15",
];

const REGS_32: [&str; 16] = [
    "eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi", "r8d", "r9d", "r10d", "r11d", "r12d",
    "r13d", "r14d", "r15d",
];

const JCC_NAMES: [&str; 16] = [
    "jo", "jno", "jb", "jae", "je", "jne", "jbe", "ja", "js", "jns", "jp", "jnp", "jl", "jge",
    "jle", "jg",
];

const ALU_NAMES: [&str; 8] = ["add", "or", "adc", "sbb", "and", "sub", "xor", "cmp"];

/// Disassembles up to `limit` x86-64 instructions from `bytes` at base virtual address `rip`.
#[must_use]
pub fn disassemble_x86_64(bytes: &[u8], rip: u64, limit: usize) -> Vec<DisasmInsn> {
    let mut out = Vec::new();
    let mut offset = 0usize;

    while offset < bytes.len() && out.len() < limit {
        let insn_start = offset;
        let addr = rip.wrapping_add(insn_start as u64);

        let mut rex = 0u8;
        let mut _has_66 = false;

        // Check for 0x66 prefix
        if offset < bytes.len() && bytes[offset] == 0x66 {
            _has_66 = true;
            offset += 1;
        }

        // Check for REX prefix (0x40 - 0x4F)
        if offset < bytes.len() && (0x40..=0x4F).contains(&bytes[offset]) {
            rex = bytes[offset];
            offset += 1;
        }

        if offset >= bytes.len() {
            break;
        }

        let op = bytes[offset];
        offset += 1;

        let rex_w = (rex & 8) != 0;
        let rex_r = (rex >> 2) & 1;
        let rex_b = rex & 1;

        let (mnemonic, text) = match op {
            0x90 => ("nop".to_string(), "nop".to_string()),
            0xCC => ("int3".to_string(), "int3".to_string()),
            0xC3 => ("ret".to_string(), "ret".to_string()),
            0xC2 if offset + 2 <= bytes.len() => {
                let imm = u16::from_le_bytes([bytes[offset], bytes[offset + 1]]);
                offset += 2;
                ("ret".to_string(), format!("ret 0x{imm:x}"))
            },
            // PUSH r64
            0x50..=0x57 => {
                let reg_idx = (op - 0x50) | (rex_b << 3);
                let reg_name = REGS_64[reg_idx as usize];
                ("push".to_string(), format!("push {reg_name}"))
            },
            // POP r64
            0x58..=0x5F => {
                let reg_idx = (op - 0x58) | (rex_b << 3);
                let reg_name = REGS_64[reg_idx as usize];
                ("pop".to_string(), format!("pop {reg_name}"))
            },
            // MOV r8, imm8
            0xB0..=0xB7 if offset < bytes.len() => {
                let imm = bytes[offset];
                offset += 1;
                let reg_idx = (op - 0xB0) | (rex_b << 3);
                let reg_name = REGS_64[reg_idx as usize];
                ("mov".to_string(), format!("mov {reg_name}, 0x{imm:x}"))
            },
            // MOV r32/r64, imm32/imm64
            0xB8..=0xBF => {
                let reg_idx = (op - 0xB8) | (rex_b << 3);
                if rex_w && offset + 8 <= bytes.len() {
                    let imm = u64::from_le_bytes([
                        bytes[offset],
                        bytes[offset + 1],
                        bytes[offset + 2],
                        bytes[offset + 3],
                        bytes[offset + 4],
                        bytes[offset + 5],
                        bytes[offset + 6],
                        bytes[offset + 7],
                    ]);
                    offset += 8;
                    let reg_name = REGS_64[reg_idx as usize];
                    ("mov".to_string(), format!("mov {reg_name}, 0x{imm:x}"))
                } else if offset + 4 <= bytes.len() {
                    let imm = u32::from_le_bytes([
                        bytes[offset],
                        bytes[offset + 1],
                        bytes[offset + 2],
                        bytes[offset + 3],
                    ]);
                    offset += 4;
                    let reg_name =
                        if rex_w { REGS_64[reg_idx as usize] } else { REGS_32[reg_idx as usize] };
                    ("mov".to_string(), format!("mov {reg_name}, 0x{imm:x}"))
                } else {
                    ("db".to_string(), format!("db 0x{op:02x}"))
                }
            },
            // MOV r/m, r (0x89) or MOV r, r/m (0x8B)
            0x89 | 0x8B if offset < bytes.len() => {
                let modrm = bytes[offset];
                offset += 1;
                let mod_bits = modrm >> 6;
                let reg_field = ((modrm >> 3) & 7) | (rex_r << 3);
                let rm_field = (modrm & 7) | (rex_b << 3);

                let r_name =
                    if rex_w { REGS_64[reg_field as usize] } else { REGS_32[reg_field as usize] };
                let rm_name =
                    if rex_w { REGS_64[rm_field as usize] } else { REGS_32[rm_field as usize] };

                if mod_bits == 3 {
                    // Register-register
                    if op == 0x89 {
                        ("mov".to_string(), format!("mov {rm_name}, {r_name}"))
                    } else {
                        ("mov".to_string(), format!("mov {r_name}, {rm_name}"))
                    }
                } else {
                    // Memory operand with displacement
                    let disp = if mod_bits == 1 && offset < bytes.len() {
                        let d = bytes[offset] as i8 as i32;
                        offset += 1;
                        d
                    } else if mod_bits == 2 && offset + 4 <= bytes.len() {
                        let d = i32::from_le_bytes([
                            bytes[offset],
                            bytes[offset + 1],
                            bytes[offset + 2],
                            bytes[offset + 3],
                        ]);
                        offset += 4;
                        d
                    } else {
                        0
                    };

                    let mem_str = if disp != 0 {
                        format!("[{rm_name} + 0x{disp:x}]")
                    } else {
                        format!("[{rm_name}]")
                    };

                    if op == 0x89 {
                        ("mov".to_string(), format!("mov {mem_str}, {r_name}"))
                    } else {
                        ("mov".to_string(), format!("mov {r_name}, {mem_str}"))
                    }
                }
            },
            // LEA (0x8D)
            0x8D if offset < bytes.len() => {
                let modrm = bytes[offset];
                offset += 1;
                let reg_field = ((modrm >> 3) & 7) | (rex_r << 3);
                let rm_field = (modrm & 7) | (rex_b << 3);
                let r_name = REGS_64[reg_field as usize];
                let rm_name = REGS_64[rm_field as usize];
                ("lea".to_string(), format!("lea {r_name}, [{rm_name}]"))
            },
            // CALL rel32
            0xE8 if offset + 4 <= bytes.len() => {
                let rel = i32::from_le_bytes([
                    bytes[offset],
                    bytes[offset + 1],
                    bytes[offset + 2],
                    bytes[offset + 3],
                ]);
                offset += 4;
                let target =
                    addr.wrapping_add((offset - insn_start) as u64).wrapping_add(rel as u64);
                ("call".to_string(), format!("call 0x{target:x}"))
            },
            // JMP rel32
            0xE9 if offset + 4 <= bytes.len() => {
                let rel = i32::from_le_bytes([
                    bytes[offset],
                    bytes[offset + 1],
                    bytes[offset + 2],
                    bytes[offset + 3],
                ]);
                offset += 4;
                let target =
                    addr.wrapping_add((offset - insn_start) as u64).wrapping_add(rel as u64);
                ("jmp".to_string(), format!("jmp 0x{target:x}"))
            },
            // JMP rel8
            0xEB if offset < bytes.len() => {
                let rel = bytes[offset] as i8 as i64;
                offset += 1;
                let target = (addr as i64)
                    .wrapping_add((offset - insn_start) as i64)
                    .wrapping_add(rel) as u64;
                ("jmp".to_string(), format!("jmp 0x{target:x}"))
            },
            // Jcc rel8
            0x70..=0x7F if offset < bytes.len() => {
                let cond_idx = (op - 0x70) as usize;
                let rel = bytes[offset] as i8 as i64;
                offset += 1;
                let target = (addr as i64)
                    .wrapping_add((offset - insn_start) as i64)
                    .wrapping_add(rel) as u64;
                let name = JCC_NAMES[cond_idx];
                (name.to_string(), format!("{name} 0x{target:x}"))
            },
            // Two-byte opcodes (0x0F)
            0x0F if offset < bytes.len() => {
                let op2 = bytes[offset];
                offset += 1;
                match op2 {
                    // Jcc rel32
                    0x80..=0x8F if offset + 4 <= bytes.len() => {
                        let cond_idx = (op2 - 0x80) as usize;
                        let rel = i32::from_le_bytes([
                            bytes[offset],
                            bytes[offset + 1],
                            bytes[offset + 2],
                            bytes[offset + 3],
                        ]);
                        offset += 4;
                        let target = addr
                            .wrapping_add((offset - insn_start) as u64)
                            .wrapping_add(rel as u64);
                        let name = JCC_NAMES[cond_idx];
                        (name.to_string(), format!("{name} 0x{target:x}"))
                    },
                    _ => ("0f_ext".to_string(), format!("0f {:02x}", op2)),
                }
            },
            // ALU register/memory operations (add, or, adc, sbb, and, sub, xor, cmp)
            0x00..=0x3F if (op & 7) <= 3 && offset < bytes.len() => {
                let alu_idx = ((op >> 3) & 7) as usize;
                let alu_name = ALU_NAMES[alu_idx];
                let is_rm_r = (op & 2) == 0;
                let modrm = bytes[offset];
                offset += 1;
                let mod_bits = modrm >> 6;
                let reg_field = ((modrm >> 3) & 7) | (rex_r << 3);
                let rm_field = (modrm & 7) | (rex_b << 3);
                let r_name =
                    if rex_w { REGS_64[reg_field as usize] } else { REGS_32[reg_field as usize] };
                let rm_name =
                    if rex_w { REGS_64[rm_field as usize] } else { REGS_32[rm_field as usize] };

                if mod_bits == 3 {
                    if is_rm_r {
                        (alu_name.to_string(), format!("{alu_name} {rm_name}, {r_name}"))
                    } else {
                        (alu_name.to_string(), format!("{alu_name} {r_name}, {rm_name}"))
                    }
                } else {
                    let mem_str = format!("[{rm_name}]");
                    if is_rm_r {
                        (alu_name.to_string(), format!("{alu_name} {mem_str}, {r_name}"))
                    } else {
                        (alu_name.to_string(), format!("{alu_name} {r_name}, {mem_str}"))
                    }
                }
            },
            _ => ("db".to_string(), format!("db 0x{op:02x}")),
        };

        let raw_slice = &bytes[insn_start..offset];
        out.push(DisasmInsn {
            offset: insn_start as u64,
            address: addr,
            bytes_hex: to_hex(raw_slice),
            mnemonic,
            text,
        });
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disasm_ret_and_nop() {
        let code = [0x90, 0xC3];
        let insns = disassemble_x86_64(&code, 0x1000, 10);
        assert_eq!(insns.len(), 2);
        assert_eq!(insns[0].mnemonic, "nop");
        assert_eq!(insns[1].mnemonic, "ret");
        assert_eq!(insns[0].address, 0x1000);
        assert_eq!(insns[1].address, 0x1001);
    }

    #[test]
    fn test_disasm_mov_rbp_rsp() {
        let code = [0x48, 0x89, 0xE5]; // mov rbp, rsp
        let insns = disassemble_x86_64(&code, 0x400000, 10);
        assert_eq!(insns.len(), 1);
        assert_eq!(insns[0].mnemonic, "mov");
        assert_eq!(insns[0].text, "mov rbp, rsp");
    }
}
