//! Panels: one entry of the admin navigation, fed from a site or bot API path. Built-in panels cover
//! what the Next.js admin showed; plugin panels (Rose Griffon, others) are JSON manifests in a directory.
use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Where a panel reads from. `Site` and `Bot` are the configured bases; `Url` is an allow-listed origin.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "base", rename_all = "lowercase")]
pub enum Upstream {
    Site,
    Bot,
    Url(String),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Panel {
    pub id: String,
    pub title: String,
    pub group: String,
    pub upstream: Upstream,
    pub path: String,
    /// `builtin` or `plugin`; set by the registry, never read from a manifest.
    #[serde(default, skip_deserializing)]
    pub source: String,
}

fn builtin(id: &str, title: &str, group: &str, upstream: Upstream, path: &str) -> Panel {
    Panel {
        id: id.into(),
        title: title.into(),
        group: group.into(),
        upstream,
        path: path.into(),
        source: "builtin".into(),
    }
}

pub fn builtin_panels() -> Vec<Panel> {
    use Upstream::{Bot, Site};
    vec![
        builtin("overview", "Overview", "Status", Site, "/api/admin/dashboard-live"),
        builtin("site-health", "Site health", "Status", Site, "/api/local/health"),
        builtin("bot-totals", "Bot totals", "Status", Bot, "/api/stats/totals"),
        builtin("pipeline", "Pipeline", "Queues", Bot, "/api/admin/pipeline"),
        builtin("goals", "Goals", "Queues", Bot, "/api/admin/goals"),
        builtin("transcriptions", "Transcriptions", "Queues", Site, "/api/admin/transcriptions"),
        builtin("databooks", "Databooks", "Queues", Site, "/api/admin/databooks/status"),
        builtin("manga", "Manga", "Queues", Bot, "/api/manga/status"),
        builtin("ia-cockpit", "IA cockpit", "AI", Bot, "/api/ia/status"),
        builtin("ai", "AI routes", "AI", Site, "/api/admin/ai"),
        builtin("a2a", "A2A", "AI", Site, "/api/admin/a2a"),
        builtin("reports", "Reports", "Community", Site, "/api/admin/reports"),
        builtin(
            "wiki-contributions",
            "Wiki contributions",
            "Community",
            Site,
            "/api/admin/wiki-contributions",
        ),
        builtin("moderation", "Moderation", "Community", Bot, "/api/moderation/stats"),
        builtin("economy", "Economy", "Community", Bot, "/api/economy/stats"),
        builtin("monetization", "Monetization", "Community", Site, "/api/admin/monetization"),
        builtin("media-library", "Media library", "Content", Site, "/api/admin/media-library"),
    ]
}

/// Plugin manifests: every `*.json` file of `dir` holds an array of panels. A plugin cannot shadow a
/// built-in id, cannot reach an origin outside `allowed_origins`, and its path must stay under `/api/`.
pub fn load_plugin_panels(
    dir: &Path,
    taken: &HashSet<String>,
    allowed_origins: &[String],
) -> Vec<Panel> {
    let mut out: Vec<Panel> = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    let mut files: Vec<_> = entries.flatten().map(|e| e.path()).collect();
    files.sort();
    let mut seen = taken.clone();
    for file in files.into_iter().filter(|p| p.extension().is_some_and(|e| e == "json")) {
        let Ok(text) = std::fs::read_to_string(&file) else { continue };
        let Ok(panels) = serde_json::from_str::<Vec<Panel>>(&text) else {
            tracing::warn!(file = %file.display(), "plugin panel manifest ignored: invalid JSON");
            continue;
        };
        for mut panel in panels {
            let origin_ok = match &panel.upstream {
                Upstream::Url(base) => allowed_origins
                    .iter()
                    .any(|o| o.trim_end_matches('/') == base.trim_end_matches('/')),
                _ => true,
            };
            let path_ok = panel.path.starts_with("/api/") && !panel.path.contains("..");
            if !origin_ok || !path_ok || panel.id.is_empty() || !seen.insert(panel.id.clone()) {
                tracing::warn!(id = %panel.id, "plugin panel refused");
                continue;
            }
            panel.source = "plugin".into();
            out.push(panel);
        }
    }
    out
}
