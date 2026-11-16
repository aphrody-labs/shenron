//! Generic JSON rendering: objects as key/value tables, arrays of objects as tables, scalars inline.
use dioxus::prelude::*;
use serde_json::Value;

const MAX_DEPTH: usize = 5;

fn scalar(value: &Value) -> String {
    match value {
        Value::Null => "-".into(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

#[component]
pub fn JsonView(value: Value, depth: usize) -> Element {
    if depth >= MAX_DEPTH {
        return rsx! { code { class: "mono", "{value}" } };
    }
    match value {
        Value::Object(map) => rsx! {
            table { class: "kv",
                tbody {
                    for (key, inner) in map {
                        tr { key: "{key}",
                            th { "{key}" }
                            td { JsonView { value: inner, depth: depth + 1 } }
                        }
                    }
                }
            }
        },
        Value::Array(items) if items.iter().all(Value::is_object) && !items.is_empty() => {
            let mut columns: Vec<String> = Vec::new();
            for item in &items {
                if let Value::Object(map) = item {
                    for key in map.keys() {
                        if !columns.contains(key) && columns.len() < 12 {
                            columns.push(key.clone());
                        }
                    }
                }
            }
            rsx! {
                div { class: "scroll",
                    table { class: "grid",
                        thead { tr { for column in columns.clone() { th { key: "{column}", "{column}" } } } }
                        tbody {
                            for (index, item) in items.into_iter().enumerate() {
                                tr { key: "{index}",
                                    for column in columns.clone() {
                                        td { key: "{column}", "{scalar(item.get(&column).unwrap_or(&Value::Null))}" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Value::Array(items) => rsx! {
            ul { class: "list",
                for (index, item) in items.into_iter().enumerate() {
                    li { key: "{index}", JsonView { value: item, depth: depth + 1 } }
                }
            }
        },
        other => rsx! { span { class: "scalar", "{scalar(&other)}" } },
    }
}
