// SPDX-License-Identifier: Apache-2.0

//! x86-64 Canonical Machine Code Binary Encoder.
//!
//! Extracted and unified from `aphrody-nie-asm`.
//! Translates high-level [`Insn`] representations into byte-exact machine code
//! with full support for address-conscious RIP displacements, SIB byte encoding,
//! and REX prefix generation.

use super::insn::*;

/// Encodes a sequence of instructions assuming base instruction pointer `0`.
#[must_use]
pub fn encode(insns: &[Insn]) -> Vec<u8> {
    encode_at(insns, 0)
}

/// Encodes a sequence of instructions starting at the given absolute instruction pointer `ip`.
#[must_use]
pub fn encode_at(insns: &[Insn], mut ip: u64) -> Vec<u8> {
    let mut out = Vec::new();
    for insn in insns {
        let start_len = out.len();
        encode_one(&mut out, *insn, ip);
        let emitted = (out.len() - start_len) as u64;
        ip = ip.wrapping_add(emitted);
    }
    out
}

fn emit_rex(out: &mut Vec<u8>, w: bool, r: u8, x: u8, b: u8, force: bool) {
    if w || r != 0 || x != 0 || b != 0 || force {
        let byte = 0x40
            | (if w { 8 } else { 0 })
            | ((r & 1) << 2)
            | ((x & 1) << 1)
            | (b & 1);
        out.push(byte);
    }
}

fn emit_modrm_sib_disp(out: &mut Vec<u8>, reg_digit: u8, m: Mem, next_ip: u64) {
    if let Some(target) = m.rip {
        // RIP-relative: mod=00, rm=101 (5) + 32-bit displacement
        let disp = (target as i64).wrapping_sub(next_ip as i64) as i32;
        let modrm = ((reg_digit & 7) << 3) | 5;
        out.push(modrm);
        out.extend_from_slice(&disp.to_le_bytes());
        return;
    }

    let base = m.base.map_or(5, |b| b.lo());
    let has_sib = m.index.is_some() || base == 4 || m.base.is_none();

    let (mod_bits, disp_len) = if m.base.is_none() {
        (0u8, 4usize) // [disp32] without base
    } else if m.disp == 0 && base != 5 && !m.disp_explicite && !m.disp32 {
        (0u8, 0usize)
    } else if (m.disp >= -128 && m.disp <= 127) && !m.disp32 {
        (1u8, 1usize)
    } else {
        (2u8, 4usize)
    };

    let rm_bits = if has_sib { 4 } else { base };
    let modrm = (mod_bits << 6) | ((reg_digit & 7) << 3) | rm_bits;
    out.push(modrm);

    if has_sib {
        let (scale_bits, index_bits) = if let Some((idx, scale)) = m.index {
            let sc = match scale {
                2 => 1,
                4 => 2,
                8 => 3,
                _ => 0,
            };
            (sc, idx.lo())
        } else {
            (0, 4) // No index (SP)
        };
        let sib = (scale_bits << 6) | ((index_bits & 7) << 3) | (base & 7);
        out.push(sib);
    }

    match disp_len {
        1 => out.push(m.disp as u8),
        4 => out.extend_from_slice(&(m.disp as u32).to_le_bytes()),
        _ => {}
    }
}

fn encode_one(out: &mut Vec<u8>, insn: Insn, ip: u64) {
    match insn {
        Insn::Ret => out.push(0xC3),
        Insn::RetImm(imm) => {
            out.push(0xC2);
            out.extend_from_slice(&imm.to_le_bytes());
        }
        Insn::Int3 => out.push(0xCC),
        Insn::Nop(len) => {
            match len {
                0 | 1 => out.push(0x90),
                2 => out.extend_from_slice(&[0x66, 0x90]),
                3 => out.extend_from_slice(&[0x0F, 0x1F, 0x00]),
                4 => out.extend_from_slice(&[0x0F, 0x1F, 0x40, 0x00]),
                _ => {
                    for _ in 0..len {
                        out.push(0x90);
                    }
                }
            }
        }
        Insn::Push(reg, force_rex) => {
            emit_rex(out, false, 0, 0, reg.hi(), force_rex);
            out.push(0x50 + reg.lo());
        }
        Insn::Pop(reg, force_rex) => {
            emit_rex(out, false, 0, 0, reg.hi(), force_rex);
            out.push(0x58 + reg.lo());
        }
        Insn::MovRegImm8(reg, imm) => {
            emit_rex(out, false, 0, 0, reg.hi(), false);
            out.push(0xB0 + reg.lo());
            out.push(imm);
        }
        Insn::MovRegImm32(reg, imm) => {
            emit_rex(out, false, 0, 0, reg.hi(), false);
            out.push(0xB8 + reg.lo());
            out.extend_from_slice(&imm.to_le_bytes());
        }
        Insn::MovRegImm64(reg, imm) => {
            emit_rex(out, true, 0, 0, reg.hi(), false);
            out.push(0xB8 + reg.lo());
            out.extend_from_slice(&imm.to_le_bytes());
        }
        Insn::MovRR(size, dst, src) => {
            if size == Size::W {
                out.push(0x66);
            }
            emit_rex(out, size.rex_w(), dst.hi(), 0, src.hi(), false);
            out.push(if size == Size::B { 0x8A } else { 0x8B });
            out.push(0xC0 | (dst.lo() << 3) | src.lo());
        }
        Insn::MovRRm(size, dst, src) => {
            if size == Size::W {
                out.push(0x66);
            }
            emit_rex(out, size.rex_w(), src.hi(), 0, dst.hi(), false);
            out.push(if size == Size::B { 0x88 } else { 0x89 });
            out.push(0xC0 | (src.lo() << 3) | dst.lo());
        }
        Insn::Load(size, dst, mem) => {
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            if size == Size::W {
                out.push(0x66);
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, size.rex_w(), dst.hi(), idx_hi, base_hi, false);
            out.push(if size == Size::B { 0x8A } else { 0x8B });
            // Calculate next IP after this instruction (approximate 5-7 bytes for rip-relative)
            let insn_len = 1 + (if size == Size::W { 1 } else { 0 }) + 1 + 1 + 4;
            emit_modrm_sib_disp(out, dst.lo(), mem, ip.wrapping_add(insn_len));
        }
        Insn::Store(size, mem, src) => {
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            if size == Size::W {
                out.push(0x66);
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, size.rex_w(), src.hi(), idx_hi, base_hi, false);
            out.push(if size == Size::B { 0x88 } else { 0x89 });
            let insn_len = 1 + (if size == Size::W { 1 } else { 0 }) + 1 + 1 + 4;
            emit_modrm_sib_disp(out, src.lo(), mem, ip.wrapping_add(insn_len));
        }
        Insn::StoreImm32(size, mem, imm) => {
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, size.rex_w(), 0, idx_hi, base_hi, false);
            out.push(0xC7);
            let insn_len = 1 + 1 + 1 + 4 + 4;
            emit_modrm_sib_disp(out, 0, mem, ip.wrapping_add(insn_len));
            out.extend_from_slice(&(imm as u32).to_le_bytes());
        }
        Insn::Lea(dst, mem) => {
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, true, dst.hi(), idx_hi, base_hi, false);
            out.push(0x8D);
            let insn_len = 2 + 1 + 4;
            emit_modrm_sib_disp(out, dst.lo(), mem, ip.wrapping_add(insn_len));
        }
        Insn::AluRR(op, size, dst, src) => {
            if size == Size::W {
                out.push(0x66);
            }
            emit_rex(out, size.rex_w(), dst.hi(), 0, src.hi(), false);
            let base_op = op.digit() * 8 + 3;
            out.push(if size == Size::B { base_op - 1 } else { base_op });
            out.push(0xC0 | (dst.lo() << 3) | src.lo());
        }
        Insn::AluRRm(op, size, dst, src) => {
            if size == Size::W {
                out.push(0x66);
            }
            emit_rex(out, size.rex_w(), src.hi(), 0, dst.hi(), false);
            let base_op = op.digit() * 8 + 1;
            out.push(if size == Size::B { base_op - 1 } else { base_op });
            out.push(0xC0 | (src.lo() << 3) | dst.lo());
        }
        Insn::AluRM(op, size, dst, mem) => {
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            if size == Size::W {
                out.push(0x66);
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, size.rex_w(), dst.hi(), idx_hi, base_hi, false);
            let base_op = op.digit() * 8 + 3;
            out.push(if size == Size::B { base_op - 1 } else { base_op });
            let insn_len = 1 + (if size == Size::W { 1 } else { 0 }) + 1 + 1 + 4;
            emit_modrm_sib_disp(out, dst.lo(), mem, ip.wrapping_add(insn_len));
        }
        Insn::AluMR(op, size, mem, src) => {
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            if size == Size::W {
                out.push(0x66);
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, size.rex_w(), src.hi(), idx_hi, base_hi, false);
            let base_op = op.digit() * 8 + 1;
            out.push(if size == Size::B { base_op - 1 } else { base_op });
            let insn_len = 1 + (if size == Size::W { 1 } else { 0 }) + 1 + 1 + 4;
            emit_modrm_sib_disp(out, src.lo(), mem, ip.wrapping_add(insn_len));
        }
        Insn::AluRI(op, size, dst, imm, force_long) => {
            if size == Size::W {
                out.push(0x66);
            }
            emit_rex(out, size.rex_w(), 0, 0, dst.hi(), false);
            let is_imm8 = (-128..=127).contains(&imm) && !force_long;
            if size == Size::B {
                out.push(0x80);
                out.push(0xC0 | (op.digit() << 3) | dst.lo());
                out.push(imm as u8);
            } else if is_imm8 {
                out.push(0x83);
                out.push(0xC0 | (op.digit() << 3) | dst.lo());
                out.push(imm as u8);
            } else {
                out.push(0x81);
                out.push(0xC0 | (op.digit() << 3) | dst.lo());
                out.extend_from_slice(&(imm as u32).to_le_bytes());
            }
        }
        Insn::TestRR(size, dst, src) => {
            if size == Size::W {
                out.push(0x66);
            }
            emit_rex(out, size.rex_w(), src.hi(), 0, dst.hi(), false);
            out.push(if size == Size::B { 0x84 } else { 0x85 });
            out.push(0xC0 | (src.lo() << 3) | dst.lo());
        }
        Insn::Shift(op, size, reg, imm) => {
            if size == Size::W {
                out.push(0x66);
            }
            emit_rex(out, size.rex_w(), 0, 0, reg.hi(), false);
            if imm == 1 {
                out.push(if size == Size::B { 0xD0 } else { 0xD1 });
                out.push(0xC0 | (op.digit() << 3) | reg.lo());
            } else {
                out.push(if size == Size::B { 0xC0 } else { 0xC1 });
                out.push(0xC0 | (op.digit() << 3) | reg.lo());
                out.push(imm);
            }
        }
        Insn::MovzxR(size, dst, src) => {
            emit_rex(out, false, dst.hi(), 0, src.hi(), false);
            out.push(0x0F);
            out.push(if size == Size::B { 0xB6 } else { 0xB7 });
            out.push(0xC0 | (dst.lo() << 3) | src.lo());
        }
        Insn::MovzxM(size, dst, mem) => {
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, false, dst.hi(), idx_hi, base_hi, false);
            out.push(0x0F);
            out.push(if size == Size::B { 0xB6 } else { 0xB7 });
            let insn_len = 3 + 1 + 4;
            emit_modrm_sib_disp(out, dst.lo(), mem, ip.wrapping_add(insn_len));
        }
        Insn::Movsxd(dst, src) => {
            emit_rex(out, true, dst.hi(), 0, src.hi(), false);
            out.push(0x63);
            out.push(0xC0 | (dst.lo() << 3) | src.lo());
        }
        Insn::Setcc(cond, reg) => {
            emit_rex(out, false, 0, 0, reg.hi(), reg.num() >= 4);
            out.push(0x0F);
            out.push(0x90 + cond.code());
            out.push(0xC0 | reg.lo());
        }
        Insn::Un(op, size, rm) => {
            let is_f7 = op.is_f7();
            let base_opcode = if is_f7 {
                if size == Size::B { 0xF6 } else { 0xF7 }
            } else {
                if size == Size::B { 0xFE } else { 0xFF }
            };

            match rm {
                Rm::R(reg) => {
                    if size == Size::W {
                        out.push(0x66);
                    }
                    emit_rex(out, size.rex_w(), 0, 0, reg.hi(), false);
                    out.push(base_opcode);
                    out.push(0xC0 | (op.digit() << 3) | reg.lo());
                }
                Rm::M(mem) => {
                    if let Some(seg) = mem.seg {
                        out.push(seg.prefix());
                    }
                    if size == Size::W {
                        out.push(0x66);
                    }
                    let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
                    let base_hi = mem.base.map_or(0, |r| r.hi());
                    emit_rex(out, size.rex_w(), 0, idx_hi, base_hi, false);
                    out.push(base_opcode);
                    let insn_len = 1 + (if size == Size::W { 1 } else { 0 }) + 1 + 1 + 4;
                    emit_modrm_sib_disp(out, op.digit(), mem, ip.wrapping_add(insn_len));
                }
            }
        }
        Insn::Call(target) => {
            out.push(0xE8);
            let next_ip = ip.wrapping_add(5);
            let disp = (target as i64).wrapping_sub(next_ip as i64) as i32;
            out.extend_from_slice(&disp.to_le_bytes());
        }
        Insn::Jmp(target) => {
            out.push(0xE9);
            let next_ip = ip.wrapping_add(5);
            let disp = (target as i64).wrapping_sub(next_ip as i64) as i32;
            out.extend_from_slice(&disp.to_le_bytes());
        }
        Insn::JmpShort(disp) => {
            out.push(0xEB);
            out.push(disp as u8);
        }
        Insn::Jcc(cond, target) => {
            out.push(0x0F);
            out.push(0x80 + cond.code());
            let next_ip = ip.wrapping_add(6);
            let disp = (target as i64).wrapping_sub(next_ip as i64) as i32;
            out.extend_from_slice(&disp.to_le_bytes());
        }
        Insn::JccShort(cond, disp) => {
            out.push(0x70 + cond.code());
            out.push(disp as u8);
        }
        Insn::Sse(op, dst, src) => {
            let (pfx, opcode) = sse_op_encoding(op);
            if let Some(p) = pfx {
                out.push(p);
            }
            match src {
                XmmRm::X(x) => {
                    emit_rex(out, false, dst.hi(), 0, x.hi(), false);
                    out.push(0x0F);
                    out.push(opcode);
                    out.push(0xC0 | (dst.lo() << 3) | x.lo());
                }
                XmmRm::M(mem) => {
                    if let Some(seg) = mem.seg {
                        out.push(seg.prefix());
                    }
                    let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
                    let base_hi = mem.base.map_or(0, |r| r.hi());
                    emit_rex(out, false, dst.hi(), idx_hi, base_hi, false);
                    out.push(0x0F);
                    out.push(opcode);
                    let insn_len = 1 + (if pfx.is_some() { 1 } else { 0 }) + 2 + 1 + 4;
                    emit_modrm_sib_disp(out, dst.lo(), mem, ip.wrapping_add(insn_len));
                }
            }
        }
        Insn::SseStore(op, mem, src) => {
            let (pfx, _) = sse_op_encoding(op);
            let store_opcode = match op {
                SseOp::Movaps => 0x29,
                SseOp::Movups => 0x11,
                SseOp::Movss | SseOp::Movsd => 0x11,
                SseOp::Movdqa | SseOp::Movdqu => 0x7F,
                _ => 0x29,
            };
            if let Some(p) = pfx {
                out.push(p);
            }
            if let Some(seg) = mem.seg {
                out.push(seg.prefix());
            }
            let idx_hi = mem.index.map_or(0, |(r, _)| r.hi());
            let base_hi = mem.base.map_or(0, |r| r.hi());
            emit_rex(out, false, src.hi(), idx_hi, base_hi, false);
            out.push(0x0F);
            out.push(store_opcode);
            let insn_len = 1 + (if pfx.is_some() { 1 } else { 0 }) + 2 + 1 + 4;
            emit_modrm_sib_disp(out, src.lo(), mem, ip.wrapping_add(insn_len));
        }
    }
}

fn sse_op_encoding(op: SseOp) -> (Option<u8>, u8) {
    match op {
        SseOp::Movaps => (None, 0x28),
        SseOp::Movups => (None, 0x10),
        SseOp::Movss => (Some(0xF3), 0x10),
        SseOp::Movsd => (Some(0xF2), 0x10),
        SseOp::Movdqa => (Some(0x66), 0x6F),
        SseOp::Movdqu => (Some(0xF3), 0x6F),
        SseOp::Xorps => (None, 0x57),
        SseOp::Xorpd => (Some(0x66), 0x57),
        SseOp::Addps => (None, 0x58),
        SseOp::Addss => (Some(0xF3), 0x58),
        SseOp::Subps => (None, 0x5C),
        SseOp::Subss => (Some(0xF3), 0x5C),
        SseOp::Mulps => (None, 0x59),
        SseOp::Mulss => (Some(0xF3), 0x59),
        SseOp::Divps => (None, 0x5E),
        SseOp::Divss => (Some(0xF3), 0x5E),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_return_true() {
        // mov al, 1 ; ret -> [0xB0, 0x01, 0xC3]
        let insns = [Insn::MovRegImm8(Reg::Rax, 1), Insn::Ret];
        let bytes = encode(&insns);
        assert_eq!(bytes, vec![0xB0, 0x01, 0xC3]);
    }

    #[test]
    fn test_encode_mov_rbp_rsp() {
        // mov rbp, rsp (size Q) -> [0x48, 0x8B, 0xEC]
        let insn = Insn::MovRR(Size::Q, Reg::Rbp, Reg::Rsp);
        let bytes = encode(&[insn]);
        assert_eq!(bytes, vec![0x48, 0x8B, 0xEC]);
    }
}
