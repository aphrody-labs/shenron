// SPDX-License-Identifier: Apache-2.0

//! x86-64 Instruction Definitions, Register Encodings, and Operands.
//!
//! Extracted and unified from `aphrody-nie-asm`.
//! Covers general purpose registers, vector registers, memory addressing modes,
//! ALU operations, SSE/AVX vector operations, and branch conditions.

use serde::{Deserialize, Serialize};

/// 64-bit general-purpose registers (also used for 8/16/32-bit encodings).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Reg {
    Rax,
    Rcx,
    Rdx,
    Rbx,
    Rsp,
    Rbp,
    Rsi,
    Rdi,
    R8,
    R9,
    R10,
    R11,
    R12,
    R13,
    R14,
    R15,
    /// High-byte `ah` (index 4, no REX prefix)
    Ah,
    /// High-byte `ch` (index 5)
    Ch,
    /// High-byte `dh` (index 6)
    Dh,
    /// High-byte `bh` (index 7)
    Bh,
}

impl Reg {
    /// Returns register encoding index 0..15.
    #[must_use]
    pub fn num(self) -> u8 {
        match self {
            Self::Ah => 4,
            Self::Ch => 5,
            Self::Dh => 6,
            Self::Bh => 7,
            Self::Rax => 0,
            Self::Rcx => 1,
            Self::Rdx => 2,
            Self::Rbx => 3,
            Self::Rsp => 4,
            Self::Rbp => 5,
            Self::Rsi => 6,
            Self::Rdi => 7,
            Self::R8 => 8,
            Self::R9 => 9,
            Self::R10 => 10,
            Self::R11 => 11,
            Self::R12 => 12,
            Self::R13 => 13,
            Self::R14 => 14,
            Self::R15 => 15,
        }
    }

    /// True for legacy high-byte registers (`ah`, `ch`, `dh`, `bh`).
    #[must_use]
    pub fn is_high_byte(self) -> bool {
        matches!(self, Self::Ah | Self::Ch | Self::Dh | Self::Bh)
    }

    /// Upper bit (bit 3) carried by REX prefix.
    #[must_use]
    pub fn hi(self) -> u8 {
        self.num() >> 3
    }

    /// Lower 3 bits carried by ModRM/SIB.
    #[must_use]
    pub fn lo(self) -> u8 {
        self.num() & 7
    }
}

/// Operand size width.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Size {
    /// 8 bits (Byte)
    B,
    /// 16 bits (Word, 0x66 prefix)
    W,
    /// 32 bits (Dword)
    D,
    /// 64 bits (Qword, REX.W)
    Q,
}

impl Size {
    /// Width in bytes.
    #[must_use]
    pub fn bytes(self) -> u8 {
        match self {
            Self::B => 1,
            Self::W => 2,
            Self::D => 4,
            Self::Q => 8,
        }
    }

    /// True if REX.W is required.
    #[must_use]
    pub fn rex_w(self) -> bool {
        self == Self::Q
    }
}

/// ALU operation for Group 1 opcodes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Alu {
    Add,
    Or,
    Adc,
    Sbb,
    And,
    Sub,
    Xor,
    Cmp,
}

impl Alu {
    /// ModRM `/n` field / opcode base (`op * 8`).
    #[must_use]
    pub fn digit(self) -> u8 {
        self as u8
    }
}

/// Condition code `tttn` for `jcc` and `setcc`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Cond {
    O,
    No,
    B,
    Ae,
    E,
    Ne,
    Be,
    A,
    S,
    Ns,
    P,
    Np,
    L,
    Ge,
    Le,
    G,
}

impl Cond {
    /// 4-bit condition code 0..15.
    #[must_use]
    pub fn code(self) -> u8 {
        self as u8
    }
}

/// Shift/Rotate operations for Group 2 opcodes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum ShiftOp {
    Rol,
    Ror,
    Shl,
    Shr,
    Sar,
}

impl ShiftOp {
    /// ModRM `/n` field.
    #[must_use]
    pub fn digit(self) -> u8 {
        match self {
            Self::Rol => 0,
            Self::Ror => 1,
            Self::Shl => 4,
            Self::Shr => 5,
            Self::Sar => 7,
        }
    }
}

/// Segment register prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Seg {
    /// `fs:` (0x64)
    Fs,
    /// `gs:` (0x65, Windows x64 TEB/TLS)
    Gs,
}

impl Seg {
    #[must_use]
    pub const fn prefix(self) -> u8 {
        match self {
            Self::Fs => 0x64,
            Self::Gs => 0x65,
        }
    }
}

/// Memory operand `[base + index*scale + disp]` or `[rip + offset]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Mem {
    pub seg: Option<Seg>,
    pub base: Option<Reg>,
    pub index: Option<(Reg, u8)>,
    pub disp: i32,
    pub disp_explicite: bool,
    pub disp32: bool,
    pub rip: Option<u64>,
}

impl Mem {
    #[must_use]
    pub fn base(base: Reg) -> Self {
        Self { base: Some(base), ..Self::default() }
    }

    #[must_use]
    pub fn base_disp(base: Reg, disp: i32) -> Self {
        Self { base: Some(base), disp, ..Self::default() }
    }

    #[must_use]
    pub fn rip(target: u64) -> Self {
        Self { rip: Some(target), ..Self::default() }
    }
}

/// Register or Memory operand (ModRM `r/m`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Rm {
    R(Reg),
    M(Mem),
}

/// Unary operations for groups `0xFF` and `0xF7`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnOp {
    Inc,
    Dec,
    CallInd,
    JmpInd,
    PushRm,
    Not,
    Neg,
    Mul,
    Imul1,
    Div,
    Idiv,
}

impl UnOp {
    #[must_use]
    pub fn digit(self) -> u8 {
        match self {
            Self::Inc => 0,
            Self::Dec => 1,
            Self::CallInd | Self::Not => 2,
            Self::Neg => 3,
            Self::JmpInd | Self::Mul => 4,
            Self::PushRm | Self::Div => 6,
            Self::Imul1 => 5,
            Self::Idiv => 7,
        }
    }

    #[must_use]
    pub fn is_f7(self) -> bool {
        matches!(self, Self::Not | Self::Neg | Self::Mul | Self::Imul1 | Self::Div | Self::Idiv)
    }
}

/// 128-bit vector register (`xmm0`..`xmm15`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Xmm(pub u8);

impl Xmm {
    #[must_use]
    pub fn hi(self) -> u8 {
        self.0 >> 3
    }

    #[must_use]
    pub fn lo(self) -> u8 {
        self.0 & 7
    }
}

/// XMM or Memory operand.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum XmmRm {
    X(Xmm),
    M(Mem),
}

/// 256-bit AVX vector register (`ymm0`..`ymm15`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Ymm(pub u8);

impl Ymm {
    #[must_use]
    pub fn hi(self) -> u8 {
        self.0 >> 3
    }

    #[must_use]
    pub fn lo(self) -> u8 {
        self.0 & 7
    }
}

/// YMM or Memory operand.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum YmmRm {
    Y(Ymm),
    M(Mem),
}

/// SSE operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum SseOp {
    Movaps,
    Movups,
    Movss,
    Movsd,
    Movdqa,
    Movdqu,
    Xorps,
    Xorpd,
    Addps,
    Addss,
    Subps,
    Subss,
    Mulps,
    Mulss,
    Divps,
    Divss,
}

/// VEX-encoded AVX operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VexOp {
    Vmovaps,
    Vmovups,
    Vxorps,
    Vaddps,
    Vmulps,
    Vsubps,
}

/// String operations with or without `rep` prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RepOp {
    Stos,
    Movs,
}

/// Unified x86-64 Instruction Representation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Insn {
    Ret,
    RetImm(u16),
    Int3,
    Nop(u8),
    Push(Reg, bool),
    Pop(Reg, bool),
    MovRegImm8(Reg, u8),
    MovRegImm32(Reg, u32),
    MovRegImm64(Reg, u64),
    MovRR(Size, Reg, Reg),
    MovRRm(Size, Reg, Reg),
    Load(Size, Reg, Mem),
    Store(Size, Mem, Reg),
    StoreImm32(Size, Mem, i32),
    Lea(Reg, Mem),
    AluRR(Alu, Size, Reg, Reg),
    AluRRm(Alu, Size, Reg, Reg),
    AluRM(Alu, Size, Reg, Mem),
    AluMR(Alu, Size, Mem, Reg),
    AluRI(Alu, Size, Reg, i32, bool),
    TestRR(Size, Reg, Reg),
    Shift(ShiftOp, Size, Reg, u8),
    MovzxR(Size, Reg, Reg),
    MovzxM(Size, Reg, Mem),
    Movsxd(Reg, Reg),
    Setcc(Cond, Reg),
    Un(UnOp, Size, Rm),
    Call(u64),
    Jmp(u64),
    JmpShort(i8),
    Jcc(Cond, u64),
    JccShort(Cond, i8),
    Sse(SseOp, Xmm, XmmRm),
    SseStore(SseOp, Mem, Xmm),
}
