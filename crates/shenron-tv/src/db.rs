//! SQLite library: one row per video, the yt-dlp metadata kept as JSON.
use rusqlite::{Connection, params};
use serde::Serialize;
use std::{path::Path, sync::Mutex};

#[derive(Serialize, Clone)]
pub struct Video {
    pub id: String,
    pub title: String,
    pub status: String,
    pub error: Option<String>,
    pub source_url: String,
    pub duration_secs: Option<f64>,
    pub renditions: Vec<u32>,
    pub created_at: i64,
    pub playlist: Option<String>,
    pub poster: Option<String>,
}

pub struct Db(Mutex<Connection>);

const COLS: &str = "id,title,status,error,source_url,duration_secs,renditions,created_at";

fn log_update_failure(id: &str, updated: rusqlite::Result<usize>) {
    if let Err(error) = updated {
        tracing::warn!(%error, id, "video row update failed");
    }
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Video> {
    let id: String = r.get(0)?;
    let status: String = r.get(2)?;
    let ready = status == "ready";
    let renditions: String = r.get(6)?;
    Ok(Video {
        playlist: ready.then(|| format!("/hls/{id}/master.m3u8")),
        poster: ready.then(|| format!("/hls/{id}/poster.jpg")),
        id,
        title: r.get(1)?,
        status,
        error: r.get(3)?,
        source_url: r.get(4)?,
        duration_secs: r.get(5)?,
        renditions: renditions.split(',').filter_map(|h| h.parse().ok()).collect(),
        created_at: r.get(7)?,
    })
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let c = Connection::open(path)?;
        c.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS videos(
               id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, error TEXT,
               source_url TEXT NOT NULL, duration_secs REAL, renditions TEXT NOT NULL DEFAULT '',
               info_json TEXT, created_at INTEGER NOT NULL);",
        )?;
        // A restart interrupts running jobs: mark them failed instead of leaving them pending.
        c.execute("UPDATE videos SET status='failed', error='interrupted by restart' WHERE status IN ('queued','downloading','transcoding')", [])?;
        Ok(Self(Mutex::new(c)))
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn insert(&self, id: &str, title: &str, url: &str, now: i64) -> rusqlite::Result<()> {
        self.conn().execute(
            "INSERT INTO videos(id,title,status,source_url,created_at) VALUES(?1,?2,'queued',?3,?4)",
            params![id, title, url, now],
        )?;
        Ok(())
    }

    pub fn set_status(&self, id: &str, status: &str, error: Option<&str>) {
        let updated = self.conn().execute(
            "UPDATE videos SET status=?2, error=?3 WHERE id=?1",
            params![id, status, error],
        );
        log_update_failure(id, updated);
    }

    pub fn set_info(&self, id: &str, title: Option<&str>, info_json: &str) {
        let updated = self.conn().execute(
            "UPDATE videos SET title=COALESCE(?2,title), info_json=?3 WHERE id=?1",
            params![id, title, info_json],
        );
        log_update_failure(id, updated);
    }

    pub fn set_ready(&self, id: &str, duration: f64, renditions: &[u32]) {
        let r = renditions.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        let updated = self.conn().execute(
            "UPDATE videos SET status='ready', error=NULL, duration_secs=?2, renditions=?3 WHERE id=?1",
            params![id, duration, r],
        );
        log_update_failure(id, updated);
    }

    pub fn get(&self, id: &str) -> Option<Video> {
        self.conn().query_row(&format!("SELECT {COLS} FROM videos WHERE id=?1"), [id], row).ok()
    }

    pub fn list(&self) -> Vec<Video> {
        let c = self.conn();
        let Ok(mut s) =
            c.prepare(&format!("SELECT {COLS} FROM videos ORDER BY created_at DESC LIMIT 500"))
        else {
            return vec![];
        };
        s.query_map([], row).map(|it| it.flatten().collect()).unwrap_or_default()
    }
}
