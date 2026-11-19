// SPDX-License-Identifier: Apache-2.0
//! SQL guards of the admin tools: a lexical scanner that splits a request into statements
//! (honouring quotes, comments and dollar quoting) so `db.query` and `db.exec` can refuse
//! multiple statements and classify the single one by its leading keyword.
//!
//! The scanner is a guard, not a parser: the real read-only guarantee is the `READ ONLY`
//! transaction the server opens, and PostgreSQL's extended protocol rejects multiple statements
//! on its own. Both are defence in depth behind these checks.

/// One statement of a request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Statement {
    /// The statement text, trimmed, without the terminating `;`.
    pub text: String,
    /// Its first keyword, upper-cased (leading parentheses skipped), e.g. `SELECT`.
    pub keyword: String,
}

const READ_KEYWORDS: [&str; 4] = ["SELECT", "WITH", "VALUES", "TABLE"];
const EXPLAIN_KEYWORDS: [&str; 8] =
    ["SELECT", "WITH", "VALUES", "TABLE", "INSERT", "UPDATE", "DELETE", "MERGE"];
const TRANSACTION_KEYWORDS: [&str; 9] =
    ["BEGIN", "START", "COMMIT", "END", "ROLLBACK", "ABORT", "SAVEPOINT", "RELEASE", "PREPARE"];

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte >= 0x80
}

/// Index just past a quoted run starting at `start` (the opening quote), or `None` when
/// unterminated. `quote` doubles to escape itself; `backslash` also enables `\x` escapes.
fn skip_quoted(bytes: &[u8], start: usize, quote: u8, backslash: bool) -> Option<usize> {
    let mut index = start + 1;
    while index < bytes.len() {
        let byte = bytes[index];
        if backslash && byte == b'\\' {
            index += 2;
            continue;
        }
        if byte == quote {
            if bytes.get(index + 1) == Some(&quote) {
                index += 2;
                continue;
            }
            return Some(index + 1);
        }
        index += 1;
    }
    None
}

/// Index just past a `/* ... */` comment (nestable) starting at `start`.
fn skip_block_comment(bytes: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0_usize;
    let mut index = start;
    while index < bytes.len() {
        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            depth += 1;
            index += 2;
        } else if bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/') {
            depth -= 1;
            index += 2;
            if depth == 0 {
                return Some(index);
            }
        } else {
            index += 1;
        }
    }
    None
}

/// The dollar-quote tag at `start` (`$$` or `$tag$`), including both dollars.
fn dollar_tag(bytes: &[u8], start: usize) -> Option<&[u8]> {
    let mut index = start + 1;
    if let Some(&first) = bytes.get(index)
        && (first.is_ascii_digit() || !is_ident_byte(first) && first != b'$')
    {
        return None;
    }
    while index < bytes.len() {
        match bytes[index] {
            b'$' => return Some(&bytes[start..=index]),
            byte if is_ident_byte(byte) => index += 1,
            _ => return None,
        }
    }
    None
}

#[derive(Default)]
struct Chunk {
    start: usize,
    end: usize,
    keyword: String,
    tokens: bool,
    /// A token other than `(` came before any keyword: the statement has no leading keyword.
    lead_closed: bool,
}

/// Split `sql` into top-level `;`-separated chunks.
fn chunks(sql: &str) -> Result<Vec<Chunk>, String> {
    let bytes = sql.as_bytes();
    let mut out = Vec::new();
    let mut current = Chunk::default();
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        let previous = index.checked_sub(1).map(|at| bytes[at]);
        match byte {
            b'-' if bytes.get(index + 1) == Some(&b'-') => {
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
            },
            b'/' if bytes.get(index + 1) == Some(&b'*') => {
                index = skip_block_comment(bytes, index).ok_or("unterminated /* comment")?;
            },
            b'\'' => {
                let escaped = previous.is_some_and(|p| p == b'E' || p == b'e')
                    && index
                        .checked_sub(2)
                        .is_none_or(|at| !is_ident_byte(bytes[at]) && bytes[at] != b'$');
                current.tokens = true;
                current.lead_closed = true;
                index = skip_quoted(bytes, index, b'\'', escaped)
                    .ok_or("unterminated string literal")?;
            },
            b'"' => {
                current.tokens = true;
                current.lead_closed = true;
                index = skip_quoted(bytes, index, b'"', false)
                    .ok_or("unterminated quoted identifier")?;
            },
            b'$' if !previous.is_some_and(is_ident_byte) => {
                current.lead_closed = true;
                if let Some(tag) = dollar_tag(bytes, index) {
                    current.tokens = true;
                    let body = index + tag.len();
                    let close = bytes[body..]
                        .windows(tag.len())
                        .position(|window| window == tag)
                        .ok_or("unterminated dollar-quoted string")?;
                    index = body + close + tag.len();
                } else {
                    current.tokens = true;
                    index += 1;
                }
            },
            b';' => {
                current.end = index;
                out.push(std::mem::take(&mut current));
                index += 1;
                current.start = index;
            },
            byte if byte.is_ascii_whitespace() => index += 1,
            b'(' => {
                current.tokens = true;
                index += 1;
            },
            byte if byte.is_ascii_alphabetic() && !current.lead_closed => {
                let begin = index;
                while index < bytes.len() && is_ident_byte(bytes[index]) {
                    index += 1;
                }
                current.keyword = sql[begin..index].to_ascii_uppercase();
                current.tokens = true;
                current.lead_closed = true;
            },
            _ => {
                current.tokens = true;
                current.lead_closed = true;
                index += 1;
            },
        }
    }
    current.end = bytes.len();
    out.push(current);
    Ok(out)
}

/// The only statement of `sql`.
///
/// # Errors
/// The text is empty, holds more than one statement, or has an unterminated quote or comment.
pub fn single_statement(sql: &str) -> Result<Statement, String> {
    let mut real: Vec<Chunk> =
        chunks(sql)?.into_iter().filter(|chunk| chunk.tokens).collect();
    match real.len() {
        0 => Err("empty statement".to_owned()),
        1 => {
            let chunk = real.remove(0);
            Ok(Statement {
                text: sql[chunk.start..chunk.end].trim().to_owned(),
                keyword: chunk.keyword,
            })
        },
        count => Err(format!("{count} statements found: exactly one statement is allowed")),
    }
}

/// A statement `db.query` may run: `SELECT`, `WITH`, `VALUES` or `TABLE`, alone.
///
/// # Errors
/// Anything else, with the reason.
pub fn read_query(sql: &str) -> Result<Statement, String> {
    let statement = single_statement(sql)?;
    if READ_KEYWORDS.contains(&statement.keyword.as_str()) {
        Ok(statement)
    } else {
        Err(format!(
            "db.query is read-only and accepts SELECT, WITH, VALUES or TABLE (got {}); use db.exec \
             with confirm for writes",
            if statement.keyword.is_empty() { "?" } else { &statement.keyword }
        ))
    }
}

/// A statement `db.explain` may plan.
///
/// # Errors
/// Multiple statements, or a statement kind `EXPLAIN` does not cover here.
pub fn explain_target(sql: &str) -> Result<Statement, String> {
    let statement = single_statement(sql)?;
    if EXPLAIN_KEYWORDS.contains(&statement.keyword.as_str()) {
        Ok(statement)
    } else {
        Err(format!(
            "db.explain plans {} (got {})",
            EXPLAIN_KEYWORDS.join(", "),
            if statement.keyword.is_empty() { "?" } else { &statement.keyword }
        ))
    }
}

/// A statement `db.exec` may run: one statement that is not transaction control (the server owns
/// the transaction: it commits or rolls back and writes the audit row inside it).
///
/// # Errors
/// Multiple statements or transaction control.
pub fn exec_statement(sql: &str) -> Result<Statement, String> {
    let statement = single_statement(sql)?;
    if TRANSACTION_KEYWORDS.contains(&statement.keyword.as_str()) {
        return Err(format!(
            "{} is transaction control: db.exec owns the transaction (use dry_run to roll back)",
            statement.keyword
        ));
    }
    Ok(statement)
}

/// Quote `name` as one SQL identifier.
#[must_use]
pub fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// A possibly schema-qualified relation name (`table` or `schema.table`) of plain identifier
/// characters, quoted for SQL.
///
/// # Errors
/// The name is empty, has more than two parts, or has characters outside `[A-Za-z0-9_$]`.
pub fn qualified_ident(name: &str) -> Result<String, String> {
    let parts: Vec<&str> = name.split('.').collect();
    let valid = |part: &&str| {
        !part.is_empty()
            && part.len() <= 63
            && part.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$')
    };
    if parts.is_empty() || parts.len() > 2 || !parts.iter().all(valid) {
        return Err(format!("invalid relation name {name:?}: use table or schema.table"));
    }
    Ok(parts.iter().map(|part| quote_ident(part)).collect::<Vec<_>>().join("."))
}

/// Is `name` a valid NOTIFY channel (an unquoted identifier of at most 63 bytes)?
#[must_use]
pub fn is_channel(name: &str) -> bool {
    let mut bytes = name.bytes();
    bytes.next().is_some_and(|first| first.is_ascii_alphabetic() || first == b'_')
        && name.len() <= 63
        && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

/// Cut `text` to at most `max` bytes on a character boundary, marking the cut.
#[must_use]
pub fn clip(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_owned();
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &text[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_select_is_one_statement() {
        let statement = single_statement("  SELECT 1 ;  ").expect("one");
        assert_eq!(statement.keyword, "SELECT");
        assert_eq!(statement.text, "SELECT 1");
        assert!(single_statement("select 1").is_ok());
    }

    #[test]
    fn multiple_statements_are_refused() {
        for sql in [
            "SELECT 1; SELECT 2",
            "SELECT 1; DROP TABLE users",
            "SELECT 1;;DELETE FROM users",
            "INSERT INTO t VALUES (1); /* hidden */ SELECT 2",
            "SELECT 1; -- c\nSELECT 2",
        ] {
            let error = single_statement(sql).expect_err(sql);
            assert!(error.contains("statements"), "{sql}: {error}");
        }
    }

    #[test]
    fn semicolons_inside_literals_and_comments_do_not_split() {
        for sql in [
            "SELECT 'a;b'",
            "SELECT 'it''s; fine'",
            "SELECT \"a;b\" FROM t",
            "SELECT $$a;b$$",
            "SELECT $tag$a;$$b$tag$",
            "SELECT 1 -- ; trailing",
            "SELECT /* ; nested /* ; */ ; */ 1",
            "SELECT E'a\\';b'",
            "SELECT $1, $2",
            "SELECT 1;  -- only a comment after\n",
        ] {
            single_statement(sql).unwrap_or_else(|error| panic!("{sql}: {error}"));
        }
    }

    #[test]
    fn unterminated_text_is_refused() {
        for sql in ["SELECT 'oops", "SELECT \"oops", "SELECT $$oops", "SELECT /* oops"] {
            assert!(single_statement(sql).is_err(), "{sql}");
        }
        assert!(single_statement("  ;  ").is_err());
        assert!(single_statement("").is_err());
        assert!(single_statement("-- nothing").is_err());
    }

    #[test]
    fn db_query_rejects_writes_and_accepts_reads() {
        for sql in [
            "INSERT INTO t VALUES (1)",
            "UPDATE t SET a = 1",
            "DELETE FROM t",
            "DROP TABLE t",
            "CREATE TABLE t (a int)",
            "TRUNCATE t",
            "COPY t TO PROGRAM 'id'",
            "SET statement_timeout = 0",
            "BEGIN",
            "COMMIT",
            "CALL p()",
            "DO $$ BEGIN END $$",
            "SELECT 1; INSERT INTO t VALUES (1)",
        ] {
            assert!(read_query(sql).is_err(), "must reject: {sql}");
        }
        for sql in [
            "SELECT * FROM t",
            "select 1",
            "WITH x AS (SELECT 1) SELECT * FROM x",
            "VALUES (1), (2)",
            "TABLE t",
            "(SELECT 1) UNION (SELECT 2)",
            "/* lead */ SELECT 1",
            "-- lead\nSELECT 1",
        ] {
            read_query(sql).unwrap_or_else(|error| panic!("{sql}: {error}"));
        }
    }

    #[test]
    fn db_exec_refuses_transaction_control_and_multiple_statements() {
        for sql in ["BEGIN", "COMMIT", "rollback", "SAVEPOINT a", "END", "SELECT 1; SELECT 2"] {
            assert!(exec_statement(sql).is_err(), "{sql}");
        }
        for sql in ["INSERT INTO t VALUES (1)", "UPDATE t SET a = 1", "ALTER TABLE t ADD b int"] {
            assert!(exec_statement(sql).is_ok(), "{sql}");
        }
    }

    #[test]
    fn explain_covers_reads_and_dml_only() {
        assert!(explain_target("SELECT 1").is_ok());
        assert!(explain_target("UPDATE t SET a = 1").is_ok());
        assert!(explain_target("EXPLAIN SELECT 1").is_err());
        assert!(explain_target("DROP TABLE t").is_err());
        assert!(explain_target("SELECT 1; SELECT 2").is_err());
    }

    #[test]
    fn identifiers_are_quoted_and_validated() {
        assert_eq!(qualified_ident("bot.media_editions").as_deref(), Ok("\"bot\".\"media_editions\""));
        assert_eq!(qualified_ident("users").as_deref(), Ok("\"users\""));
        for bad in ["", "a.b.c", "a b", "a;drop", "a\"b", ".a", "a."] {
            assert!(qualified_ident(bad).is_err(), "{bad}");
        }
        assert_eq!(quote_ident("we\"ird"), "\"we\"\"ird\"");
        assert!(is_channel("shenron_mcp_table"));
        assert!(!is_channel("1abc"));
        assert!(!is_channel("a-b"));
        assert!(!is_channel(&"a".repeat(64)));
    }

    #[test]
    fn clip_respects_char_boundaries() {
        assert_eq!(clip("hello", 10), "hello");
        assert_eq!(clip("hello world", 5), "hello...");
        assert_eq!(clip("ééé", 3), "é...");
    }
}
