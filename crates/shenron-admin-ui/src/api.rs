//! Calls to the admin. service. The token lives in memory only.
use serde_json::Value;

#[derive(Clone, PartialEq)]
pub struct Session {
    pub base: String,
    pub token: String,
}

impl Session {
    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base.trim_end_matches('/'), path)
    }

    #[cfg(not(target_family = "wasm"))]
    pub async fn get(&self, path: &str) -> Result<Value, String> {
        let response = reqwest::Client::new()
            .get(self.url(path))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| format!("unreachable: {e}"))?;
        let status = response.status();
        let body: Value = response.json().await.unwrap_or(Value::Null);
        if status.is_success() {
            Ok(body)
        } else {
            let detail = body.get("error").and_then(Value::as_str).unwrap_or("request failed");
            Err(format!("{} {}", status.as_u16(), detail))
        }
    }

    #[cfg(target_family = "wasm")]
    pub async fn get(&self, path: &str) -> Result<Value, String> {
        let _ = self.url(path);
        Err("wasm fetch bridge pending".to_string())
    }
}
