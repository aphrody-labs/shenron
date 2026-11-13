# Lua 5.2 Technical Specification & REA Bytecode Manual

## 1. Lua 5.2 Chunk Format (PUC-Rio `undump.c`)

A compiled Lua 5.2 file begins with a 12-byte header, followed by the main function prototype:

```
+--------------------+-------------------+---------------------+-------------------------+
| Signature (4B)     | Version (1B)      | Format (1B)         | LUAC_DATA (6B)          |
| "\x1bLua"          | 0x52              | 0x00                | "\x19\x93\r\n\x1a\n"    |
+--------------------+-------------------+---------------------+-------------------------+
| sizeof(int) (1B)   | sizeof(size_t)(1B)| sizeof(Instr) (1B)  | sizeof(lua_Number) (1B) |
| 0x04               | 0x04 or 0x08      | 0x04                | 0x08                    |
+--------------------+-------------------+---------------------+-------------------------+
| Integral flag (1B) | Top-Level Function Prototype...                                  |
| 0x00 (Float)       |                                                                   |
+--------------------+-------------------------------------------------------------------+
```

---

## 2. Lua 5.2 Instruction Formats (32-bit Words)

Every Lua 5.2 instruction is a 32-bit unsigned integer with 4 fields:

- **`iABC`**: Opcode (6 bits, [0..5]), A (8 bits, [6..13]), C (9 bits, [14..22]), B (9 bits, [23..31]).
- **`iABx`**: Opcode (6 bits), A (8 bits), Bx (18 bits, [14..31] unsigned).
- **`iAsBx`**: Opcode (6 bits), A (8 bits), sBx (18 bits, signed with bias `(1 << 17) - 1` = 131071).
- **`iAx`**: Opcode (6 bits), Ax (26 bits, [6..31] unsigned, used exclusively by `EXTRAARG`).

---

## 3. The 40 Lua 5.2 Opcodes

| Opcode | Name       | Format  | Semantics                                                        |
| :----- | :--------- | :------ | :--------------------------------------------------------------- |
| `00`   | `MOVE`     | `iABC`  | `R(A) := R(B)`                                                   |
| `01`   | `LOADK`    | `iABx`  | `R(A) := Kst(Bx)`                                                |
| `02`   | `LOADKX`   | `iABx`  | `R(A) := Kst(extra arg)`                                         |
| `03`   | `LOADBOOL` | `iABC`  | `R(A) := (Bool)B; if (C) pc++`                                   |
| `04`   | `LOADNIL`  | `iABC`  | `R(A), R(A+1), ..., R(A+B) := nil`                               |
| `05`   | `GETUPVAL` | `iABC`  | `R(A) := UpValue[B]`                                             |
| `06`   | `GETTABUP` | `iABC`  | `R(A) := UpValue[B][RK(C)]`                                      |
| `07`   | `GETTABLE` | `iABC`  | `R(A) := R(B)[RK(C)]`                                            |
| `08`   | `SETTABUP` | `iABC`  | `UpValue[A][RK(B)] := RK(C)`                                     |
| `09`   | `SETUPVAL` | `iABC`  | `UpValue[B] := R(A)`                                             |
| `10`   | `SETTABLE` | `iABC`  | `R(A)[RK(B)] := RK(C)`                                           |
| `11`   | `NEWTABLE` | `iABC`  | `R(A) := {} (size = B, C)`                                       |
| `12`   | `SELF`     | `iABC`  | `R(A+1) := R(B); R(A) := R(B)[RK(C)]`                            |
| `13`   | `ADD`      | `iABC`  | `R(A) := RK(B) + RK(C)`                                          |
| `14`   | `SUB`      | `iABC`  | `R(A) := RK(B) - RK(C)`                                          |
| `15`   | `MUL`      | `iABC`  | `R(A) := RK(B) * RK(C)`                                          |
| `16`   | `DIV`      | `iABC`  | `R(A) := RK(B) / RK(C)`                                          |
| `17`   | `MOD`      | `iABC`  | `R(A) := RK(B) % RK(C)`                                          |
| `18`   | `POW`      | `iABC`  | `R(A) := RK(B) ^ RK(C)`                                          |
| `19`   | `UNM`      | `iABC`  | `R(A) := -R(B)`                                                  |
| `20`   | `NOT`      | `iABC`  | `R(A) := not R(B)`                                               |
| `21`   | `LEN`      | `iABC`  | `R(A) := length of R(B)`                                         |
| `22`   | `CONCAT`   | `iABC`  | `R(A) := R(B).. ... ..R(C)`                                      |
| `23`   | `JMP`      | `iAsBx` | `pc += sBx; if (A) close >= R(A-1)`                              |
| `24`   | `EQ`       | `iABC`  | `if ((RK(B) == RK(C)) ~= A) then pc++`                           |
| `25`   | `LT`       | `iABC`  | `if ((RK(B) < RK(C)) ~= A) then pc++`                            |
| `26`   | `LE`       | `iABC`  | `if ((RK(B) <= RK(C)) ~= A) then pc++`                           |
| `27`   | `TEST`     | `iABC`  | `if not (R(A) <=> C) then pc++`                                  |
| `28`   | `TESTSET`  | `iABC`  | `if (R(B) <=> C) then R(A) := R(B) else pc++`                    |
| `29`   | `CALL`     | `iABC`  | `R(A), ... ,R(A+C-2) := R(A)(R(A+1), ... ,R(A+B-1))`             |
| `30`   | `TAILCALL` | `iABC`  | `return R(A)(R(A+1), ... ,R(A+B-1))`                             |
| `31`   | `RETURN`   | `iABC`  | `return R(A), ... ,R(A+B-2)`                                     |
| `32`   | `FORLOOP`  | `iAsBx` | `R(A)+=R(A+2); if R(A) <?= R(A+1) then { pc+=sBx; R(A+3)=R(A) }` |
| `33`   | `FORPREP`  | `iAsBx` | `R(A)-=R(A+2); pc+=sBx`                                          |
| `34`   | `TFORCALL` | `iABC`  | `R(A+3), ... ,R(A+2+C) := R(A)(R(A+1), R(A+2))`                  |
| `35`   | `TFORLOOP` | `iAsBx` | `if R(A+1) ~= nil then { R(A)=R(A+1); pc += sBx }`               |
| `36`   | `SETLIST`  | `iABC`  | `R(A)[(C-1)*FPF+i] := R(A+i), 1 <= i <= B`                       |
| `37`   | `CLOSURE`  | `iABx`  | `R(A) := closure(KPROTO[Bx])`                                    |
| `38`   | `VARARG`   | `iABC`  | `R(A), R(A+1), ..., R(A+B-2) = vararg`                           |
| `39`   | `EXTRAARG` | `iAx`   | `extra (larger) argument for previous opcode`                    |
