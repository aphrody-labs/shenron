// SPDX-License-Identifier: Apache-2.0

//! Assembly Text Representation, Disassembly String Formatting, and Instruction Parsing.
//!
//! Provides two-way translation between symbolic assembly text lines
//! (e.g. `push rbx ; sub rsp, 0x20 ; ret`) and high-level [`Insn`] values.
//! Adapted from `aphrody-nie-asm::text`.

use super::insn::*;
use thiserror::Error;

/// Error parsing an assembly text line.
#[derive(Debug, Clone, Error, PartialEq, Eq)]
#[error("Assembly parse error: {0}")]
pub struct ParseError(pub String);

/// Formats a single instruction into canonical assembly text.
#[must_use]
pub fn to_line(insn: &Insn) -> String {
    match insn {
        Insn::Ret => "ret".into(),
        Insn::RetImm(imm) => format!("ret 0x{imm:x}"),
        Insn::Int3 => "int3".into(),
        Insn::Nop(len) => format!("nop {len}"),
        Insn::Push(r, _) => format!("push {}", reg_name(*r, Size::Q)),
        Insn::Pop(r, _) => format!("pop {}", reg_name(*r, Size::Q)),
        Insn::MovRegImm8(r, imm) => format!("mov {}, 0x{imm:x}", reg_name(*r, Size::B)),
        Insn::MovRegImm32(r, imm) => format!("mov {}, 0x{imm:x}", reg_name(*r, Size::D)),
        Insn::MovRegImm64(r, imm) => format!("mov {}, 0x{imm:x}", reg_name(*r, Size::Q)),
        Insn::MovRR(sz, dst, src) => {
            format!("mov {}, {}", reg_name(*dst, *sz), reg_name(*src, *sz))
        },
        Insn::MovRRm(sz, dst, src) => {
            format!("mov {}, {}", reg_name(*src, *sz), reg_name(*dst, *sz))
        },
        Insn::Load(sz, dst, mem) => format!("mov {}, {}", reg_name(*dst, *sz), format_mem(mem)),
        Insn::Store(sz, mem, src) => format!("mov {}, {}", format_mem(mem), reg_name(*src, *sz)),
        Insn::StoreImm32(_sz, mem, imm) => format!("mov {}, 0x{imm:x}", format_mem(mem)),
        Insn::Lea(dst, mem) => format!("lea {}, {}", reg_name(*dst, Size::Q), format_mem(mem)),
        Insn::AluRR(op, sz, dst, src) => {
            let op_str = alu_name(*op);
            format!("{op_str} {}, {}", reg_name(*dst, *sz), reg_name(*src, *sz))
        },
        Insn::AluRRm(op, sz, dst, src) => {
            let op_str = alu_name(*op);
            format!("{op_str} {}, {}", reg_name(*src, *sz), reg_name(*dst, *sz))
        },
        Insn::AluRM(op, sz, dst, mem) => {
            let op_str = alu_name(*op);
            format!("{op_str} {}, {}", reg_name(*dst, *sz), format_mem(mem))
        },
        Insn::AluMR(op, sz, mem, src) => {
            let op_str = alu_name(*op);
            format!("{op_str} {}, {}", format_mem(mem), reg_name(*src, *sz))
        },
        Insn::AluRI(op, sz, dst, imm, _) => {
            let op_str = alu_name(*op);
            format!("{op_str} {}, 0x{imm:x}", reg_name(*dst, *sz))
        },
        Insn::TestRR(sz, dst, src) => {
            format!("test {}, {}", reg_name(*dst, *sz), reg_name(*src, *sz))
        },
        Insn::Shift(op, sz, r, imm) => {
            let op_str = shift_name(*op);
            format!("{op_str} {}, 0x{imm:x}", reg_name(*r, *sz))
        },
        Insn::MovzxR(sz, dst, src) => {
            format!("movzx {}, {}", reg_name(*dst, Size::D), reg_name(*src, *sz))
        },
        Insn::MovzxM(_sz, dst, mem) => {
            format!("movzx {}, {}", reg_name(*dst, Size::D), format_mem(mem))
        },
        Insn::Movsxd(dst, src) => {
            format!("movsxd {}, {}", reg_name(*dst, Size::Q), reg_name(*src, Size::D))
        },
        Insn::Setcc(cond, r) => format!("set{} {}", cond_name(*cond), reg_name(*r, Size::B)),
        Insn::Un(op, sz, rm) => {
            let op_str = unop_name(*op);
            match rm {
                Rm::R(r) => format!("{op_str} {}", reg_name(*r, *sz)),
                Rm::M(m) => format!("{op_str} {}", format_mem(m)),
            }
        },
        Insn::Call(tgt) => format!("call 0x{tgt:x}"),
        Insn::Jmp(tgt) => format!("jmp 0x{tgt:x}"),
        Insn::JmpShort(disp) => format!("jmp.s {disp}"),
        Insn::Jcc(cond, tgt) => format!("j{} 0x{tgt:x}", cond_name(*cond)),
        Insn::JccShort(cond, disp) => format!("j{}.s {disp}", cond_name(*cond)),
        Insn::Sse(op, dst, src) => {
            let op_str = sse_name(*op);
            match src {
                XmmRm::X(x) => format!("{op_str} xmm{}, xmm{}", dst.0, x.0),
                XmmRm::M(m) => format!("{op_str} xmm{}, {}", dst.0, format_mem(m)),
            }
        },
        Insn::SseStore(op, mem, src) => {
            let op_str = sse_name(*op);
            format!("{op_str} {}, xmm{}", format_mem(mem), src.0)
        },
    }
}

/// Parses an instruction from a single line of text.
pub fn parse_insn(line: &str) -> Result<Insn, ParseError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(ParseError("Empty line".into()));
    }

    if trimmed == "ret" {
        return Ok(Insn::Ret);
    }
    if trimmed == "int3" {
        return Ok(Insn::Int3);
    }
    if trimmed == "nop" {
        return Ok(Insn::Nop(1));
    }

    let parts: Vec<&str> = trimmed.splitn(2, |c: char| c.is_ascii_whitespace()).collect();
    let mnemonic = parts[0].to_lowercase();
    let operands = parts.get(1).map(|s| s.trim()).unwrap_or("");

    match mnemonic.as_str() {
        "ret" => {
            let imm = parse_imm(operands)? as u16;
            Ok(Insn::RetImm(imm))
        },
        "push" => {
            let r = parse_reg(operands)?;
            Ok(Insn::Push(r, false))
        },
        "pop" => {
            let r = parse_reg(operands)?;
            Ok(Insn::Pop(r, false))
        },
        "call" => {
            let tgt = parse_imm(operands)? as u64;
            Ok(Insn::Call(tgt))
        },
        "jmp" => {
            let tgt = parse_imm(operands)? as u64;
            Ok(Insn::Jmp(tgt))
        },
        "mov" => {
            let ops: Vec<&str> = operands.split(',').map(|s| s.trim()).collect();
            if ops.len() != 2 {
                return Err(ParseError("mov requires 2 operands".into()));
            }
            if let Ok((dst_r, sz)) = parse_reg_size(ops[0]) {
                if let Ok(imm) = parse_imm(ops[1]) {
                    match sz {
                        Size::B => Ok(Insn::MovRegImm8(dst_r, imm as u8)),
                        Size::Q if (imm as u64) > u32::MAX as u64 => {
                            Ok(Insn::MovRegImm64(dst_r, imm as u64))
                        },
                        _ => Ok(Insn::MovRegImm32(dst_r, imm as u32)),
                    }
                } else if let Ok((src_r, _)) = parse_reg_size(ops[1]) {
                    Ok(Insn::MovRR(sz, dst_r, src_r))
                } else {
                    let mem = parse_mem(ops[1])?;
                    Ok(Insn::Load(sz, dst_r, mem))
                }
            } else {
                let mem = parse_mem(ops[0])?;
                let (src_r, sz) = parse_reg_size(ops[1])?;
                Ok(Insn::Store(sz, mem, src_r))
            }
        },
        _ => Err(ParseError(format!("Unrecognized instruction mnemonic: {mnemonic}"))),
    }
}

/// Parses multiple instructions separated by semicolons or newlines.
pub fn parse_line(line: &str) -> Result<Vec<Insn>, ParseError> {
    let mut out = Vec::new();
    for part in line.split(';') {
        let p = part.trim();
        if !p.is_empty() {
            out.push(parse_insn(p)?);
        }
    }
    Ok(out)
}

fn parse_reg_size(s: &str) -> Result<(Reg, Size), ParseError> {
    let lower = s.to_lowercase();
    let reg = parse_reg(&lower)?;
    let size = match lower.as_str() {
        "al" | "cl" | "dl" | "bl" | "spl" | "bpl" | "sil" | "dil" | "r8b" | "r9b" | "r10b"
        | "r11b" | "r12b" | "r13b" | "r14b" | "r15b" | "ah" | "ch" | "dh" | "bh" => Size::B,
        "ax" | "cx" | "dx" | "bx" | "sp" | "bp" | "si" | "di" | "r8w" | "r9w" | "r10w" | "r11w"
        | "r12w" | "r13w" | "r14w" | "r15w" => Size::W,
        "eax" | "ecx" | "edx" | "ebx" | "esp" | "ebp" | "esi" | "edi" | "r8d" | "r9d" | "r10d"
        | "r11d" | "r12d" | "r13d" | "r14d" | "r15d" => Size::D,
        _ => Size::Q,
    };
    Ok((reg, size))
}

fn parse_reg(s: &str) -> Result<Reg, ParseError> {
    match s.to_lowercase().as_str() {
        "rax" | "eax" | "ax" | "al" => Ok(Reg::Rax),
        "rcx" | "ecx" | "cx" | "cl" => Ok(Reg::Rcx),
        "rdx" | "edx" | "dx" | "dl" => Ok(Reg::Rdx),
        "rbx" | "ebx" | "bx" | "bl" => Ok(Reg::Rbx),
        "rsp" | "esp" | "sp" | "spl" => Ok(Reg::Rsp),
        "rbp" | "ebp" | "bp" | "bpl" => Ok(Reg::Rbp),
        "rsi" | "esi" | "si" | "sil" => Ok(Reg::Rsi),
        "rdi" | "edi" | "di" | "dil" => Ok(Reg::Rdi),
        "r8" | "r8d" | "r8w" | "r8b" => Ok(Reg::R8),
        "r9" | "r9d" | "r9w" | "r9b" => Ok(Reg::R9),
        "r10" | "r10d" | "r10w" | "r10b" => Ok(Reg::R10),
        "r11" | "r11d" | "r11w" | "r11b" => Ok(Reg::R11),
        "r12" | "r12d" | "r12w" | "r12b" => Ok(Reg::R12),
        "r13" | "r13d" | "r13w" | "r13b" => Ok(Reg::R13),
        "r14" | "r14d" | "r14w" | "r14b" => Ok(Reg::R14),
        "r15" | "r15d" | "r15w" | "r15b" => Ok(Reg::R15),
        "ah" => Ok(Reg::Ah),
        "ch" => Ok(Reg::Ch),
        "dh" => Ok(Reg::Dh),
        "bh" => Ok(Reg::Bh),
        _ => Err(ParseError(format!("Unknown register: {s}"))),
    }
}

fn parse_imm(s: &str) -> Result<i64, ParseError> {
    let clean = s.trim().trim_start_matches('+');
    if let Some(hex) = clean.strip_prefix("0x").or_else(|| clean.strip_prefix("0X")) {
        i64::from_str_radix(hex, 16).map_err(|e| ParseError(format!("Invalid hex immediate: {e}")))
    } else {
        clean.parse::<i64>().map_err(|e| ParseError(format!("Invalid decimal immediate: {e}")))
    }
}

fn parse_mem(s: &str) -> Result<Mem, ParseError> {
    let trimmed = s.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return Err(ParseError(format!("Invalid memory operand format: {s}")));
    }
    let inner = &trimmed[1..trimmed.len() - 1].trim();
    let parts: Vec<&str> = inner.split('+').map(|p| p.trim()).collect();
    if parts.is_empty() {
        return Err(ParseError("Empty memory operand".into()));
    }

    let base_reg = parse_reg(parts[0])?;
    let disp = if parts.len() > 1 { parse_imm(parts[1])? as i32 } else { 0 };

    Ok(Mem::base_disp(base_reg, disp))
}

fn format_mem(m: &Mem) -> String {
    if let Some(target) = m.rip {
        return format!("[rip + 0x{target:x}]");
    }
    let base_name = m.base.map_or("0".to_string(), |r| reg_name(r, Size::Q).to_string());
    if m.disp != 0 { format!("[{base_name} + 0x{:x}]", m.disp) } else { format!("[{base_name}]") }
}

fn reg_name(r: Reg, sz: Size) -> &'static str {
    match sz {
        Size::Q => match r {
            Reg::Rax => "rax",
            Reg::Rcx => "rcx",
            Reg::Rdx => "rdx",
            Reg::Rbx => "rbx",
            Reg::Rsp => "rsp",
            Reg::Rbp => "rbp",
            Reg::Rsi => "rsi",
            Reg::Rdi => "rdi",
            Reg::R8 => "r8",
            Reg::R9 => "r9",
            Reg::R10 => "r10",
            Reg::R11 => "r11",
            Reg::R12 => "r12",
            Reg::R13 => "r13",
            Reg::R14 => "r14",
            Reg::R15 => "r15",
            _ => "rax",
        },
        Size::D => match r {
            Reg::Rax => "eax",
            Reg::Rcx => "ecx",
            Reg::Rdx => "edx",
            Reg::Rbx => "ebx",
            Reg::Rsp => "esp",
            Reg::Rbp => "ebp",
            Reg::Rsi => "esi",
            Reg::Rdi => "edi",
            Reg::R8 => "r8d",
            Reg::R9 => "r9d",
            Reg::R10 => "r10d",
            Reg::R11 => "r11d",
            Reg::R12 => "r12d",
            Reg::R13 => "r13d",
            Reg::R14 => "r14d",
            Reg::R15 => "r15d",
            _ => "eax",
        },
        Size::W => match r {
            Reg::Rax => "ax",
            Reg::Rcx => "cx",
            Reg::Rdx => "dx",
            Reg::Rbx => "bx",
            Reg::Rsp => "sp",
            Reg::Rbp => "bp",
            Reg::Rsi => "si",
            Reg::Rdi => "di",
            Reg::R8 => "r8w",
            Reg::R9 => "r9w",
            Reg::R10 => "r10w",
            Reg::R11 => "r11w",
            Reg::R12 => "r12w",
            Reg::R13 => "r13w",
            Reg::R14 => "r14w",
            Reg::R15 => "r15w",
            _ => "ax",
        },
        Size::B => match r {
            Reg::Ah => "ah",
            Reg::Ch => "ch",
            Reg::Dh => "dh",
            Reg::Bh => "bh",
            Reg::Rax => "al",
            Reg::Rcx => "cl",
            Reg::Rdx => "dl",
            Reg::Rbx => "bl",
            Reg::Rsp => "spl",
            Reg::Rbp => "bpl",
            Reg::Rsi => "sil",
            Reg::Rdi => "dil",
            Reg::R8 => "r8b",
            Reg::R9 => "r9b",
            Reg::R10 => "r10b",
            Reg::R11 => "r11b",
            Reg::R12 => "r12b",
            Reg::R13 => "r13b",
            Reg::R14 => "r14b",
            Reg::R15 => "r15b",
        },
    }
}

fn alu_name(op: Alu) -> &'static str {
    match op {
        Alu::Add => "add",
        Alu::Or => "or",
        Alu::Adc => "adc",
        Alu::Sbb => "sbb",
        Alu::And => "and",
        Alu::Sub => "sub",
        Alu::Xor => "xor",
        Alu::Cmp => "cmp",
    }
}

fn cond_name(cond: Cond) -> &'static str {
    match cond {
        Cond::O => "o",
        Cond::No => "no",
        Cond::B => "b",
        Cond::Ae => "ae",
        Cond::E => "e",
        Cond::Ne => "ne",
        Cond::Be => "be",
        Cond::A => "a",
        Cond::S => "s",
        Cond::Ns => "ns",
        Cond::P => "p",
        Cond::Np => "np",
        Cond::L => "l",
        Cond::Ge => "ge",
        Cond::Le => "le",
        Cond::G => "g",
    }
}

fn shift_name(op: ShiftOp) -> &'static str {
    match op {
        ShiftOp::Rol => "rol",
        ShiftOp::Ror => "ror",
        ShiftOp::Shl => "shl",
        ShiftOp::Shr => "shr",
        ShiftOp::Sar => "sar",
    }
}

fn unop_name(op: UnOp) -> &'static str {
    match op {
        UnOp::Inc => "inc",
        UnOp::Dec => "dec",
        UnOp::CallInd => "call",
        UnOp::JmpInd => "jmp",
        UnOp::PushRm => "push",
        UnOp::Not => "not",
        UnOp::Neg => "neg",
        UnOp::Mul => "mul",
        UnOp::Imul1 => "imul",
        UnOp::Div => "div",
        UnOp::Idiv => "idiv",
    }
}

fn sse_name(op: SseOp) -> &'static str {
    match op {
        SseOp::Movaps => "movaps",
        SseOp::Movups => "movups",
        SseOp::Movss => "movss",
        SseOp::Movsd => "movsd",
        SseOp::Movdqa => "movdqa",
        SseOp::Movdqu => "movdqu",
        SseOp::Xorps => "xorps",
        SseOp::Xorpd => "xorpd",
        SseOp::Addps => "addps",
        SseOp::Addss => "addss",
        SseOp::Subps => "subps",
        SseOp::Subss => "subss",
        SseOp::Mulps => "mulps",
        SseOp::Mulss => "mulss",
        SseOp::Divps => "divps",
        SseOp::Divss => "divss",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_parse_and_format_roundtrip() {
        let line = "push rbx ; ret";
        let insns = parse_line(line).expect("parse line");
        assert_eq!(insns.len(), 2);
        assert_eq!(insns[0], Insn::Push(Reg::Rbx, false));
        assert_eq!(insns[1], Insn::Ret);

        assert_eq!(to_line(&insns[0]), "push rbx");
        assert_eq!(to_line(&insns[1]), "ret");
    }
}
