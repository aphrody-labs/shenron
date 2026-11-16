//! shenron-admin-app: the admin. dashboard (Dioxus). `--features desktop` for the native window,
//! `--features web` for the wasm build served by the admin. service.
mod api;
mod view;

use api::Session;
use dioxus::prelude::*;
use serde_json::Value;
use view::JsonView;

const CSS: &str = include_str!("style.css");

fn default_base() -> String {
    // Web build: same origin. Desktop: the service named by SHENRON_ADMIN_URL.
    #[cfg(target_arch = "wasm32")]
    {
        web_sys::window().and_then(|w| w.location().origin().ok()).unwrap_or_default()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::env::var("SHENRON_ADMIN_URL")
            .unwrap_or_else(|_| "https://admin.dragonballfr.com".into())
    }
}

/// Desktop operators can preload the token (`SHENRON_ADMIN_TOKEN`); the web build never reads it.
fn preset_token() -> String {
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::env::var("SHENRON_ADMIN_TOKEN").unwrap_or_default()
    }
    #[cfg(target_arch = "wasm32")]
    {
        String::new()
    }
}

fn main() {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    let session = use_signal(|| None::<Session>);
    rsx! {
        style { "{CSS}" }
        document::Title { "Shenron admin" }
        match session() {
            Some(current) => rsx! { Dashboard { session: current, on_logout: move |_| { let mut s = session; s.set(None) } } },
            None => rsx! { Login { session } },
        }
    }
}

#[component]
fn Login(session: Signal<Option<Session>>) -> Element {
    let mut base = use_signal(default_base);
    let mut token = use_signal(preset_token);
    let mut error = use_signal(String::new);
    let mut busy = use_signal(|| false);
    let mut submit = move |_| {
        let candidate = Session { base: base(), token: token() };
        busy.set(true);
        error.set(String::new());
        spawn(async move {
            match candidate.get("/api/me").await {
                Ok(_) => session.set(Some(candidate)),
                Err(e) => error.set(e),
            }
            busy.set(false);
        });
    };
    use_effect(move || {
        if !token.peek().is_empty() {
            submit(());
        }
    });
    rsx! {
        div { class: "login",
            form { class: "card", aria_label: "Sign in", role: "form", onsubmit: move |e| { e.prevent_default(); submit(()) },
                h1 { "Shenron admin" }
                if cfg!(not(target_arch = "wasm32")) {
                    label { class: "dim", r#for: "server", "Server" }
                    input { id: "server", name: "server", aria_label: "Server URL", value: "{base}", oninput: move |e| base.set(e.value()) }
                }
                label { class: "dim", r#for: "token", "Access token" }
                input { id: "token", name: "token", aria_label: "Access token", autocomplete: "off", r#type: "password", value: "{token}", oninput: move |e| token.set(e.value()), autofocus: true }
                if !error().is_empty() { div { class: "err", role: "alert", "{error}" } }
                button { class: "btn", aria_label: "Sign in", r#type: "submit", disabled: busy(), if busy() { "Checking" } else { "Sign in" } }
            }
        }
    }
}

#[component]
fn Dashboard(session: Session, on_logout: EventHandler<()>) -> Element {
    let panels_session = session.clone();
    let panels = use_resource(move || {
        let s = panels_session.clone();
        async move { s.get("/api/panels").await }
    });
    let mut selected = use_signal(|| "overview".to_string());
    let mut refresh = use_signal(|| 0u32);

    let panel_session = session.clone();
    let data = use_resource(move || {
        let s = panel_session.clone();
        let id = selected();
        let _ = refresh();
        async move { s.get(&format!("/api/panels/{id}")).await }
    });

    let listing: Vec<Value> = match &*panels.read() {
        Some(Ok(Value::Array(items))) => items.clone(),
        _ => Vec::new(),
    };
    let mut groups: Vec<String> = Vec::new();
    for item in &listing {
        let group = item["group"].as_str().unwrap_or("Other").to_string();
        if !groups.contains(&group) {
            groups.push(group);
        }
    }
    let title = listing
        .iter()
        .find(|p| p["id"].as_str() == Some(selected().as_str()))
        .and_then(|p| p["title"].as_str().map(str::to_string))
        .unwrap_or_else(|| selected());

    rsx! {
        div { class: "shell",
            nav { aria_label: "Panels",
                h1 { "SHENRON ADMIN" }
                for group in groups {
                    h2 { key: "{group}", "{group}" }
                    for item in listing.iter().filter(|p| p["group"].as_str().unwrap_or("Other") == group) {
                        {
                            let id = item["id"].as_str().unwrap_or_default().to_string();
                            let label = item["title"].as_str().unwrap_or_default().to_string();
                            let on = selected() == id;
                            rsx! { button { key: "{id}", class: if on { "on" } else { "" }, aria_label: "Open panel {label}", aria_current: if on { "page" } else { "false" }, onclick: move |_| selected.set(id.clone()), "{label}" } }
                        }
                    }
                }
            }
            main { aria_label: "Panel content",
                header { class: "bar",
                    h2 { "{title}" }
                    span { class: "sp" }
                    button { class: "btn ghost", aria_label: "Refresh panel", onclick: move |_| refresh += 1, "Refresh" }
                    button { class: "btn ghost", aria_label: "Sign out", onclick: move |_| on_logout.call(()), "Sign out" }
                }
                div { class: "card", role: "region", aria_label: "{title}", aria_live: "polite",
                    match &*data.read() {
                        None => rsx! { span { class: "dim", "Loading" } },
                        Some(Err(e)) => rsx! { span { class: "err", "{e}" } },
                        Some(Ok(body)) => rsx! {
                            div { class: "dim mono", "upstream status {body[\"status\"]}" }
                            JsonView { value: body["data"].clone(), depth: 0 }
                        },
                    }
                }
            }
        }
    }
}
