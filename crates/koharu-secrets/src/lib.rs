use keyring_core::Entry;
use secrecy::{SecretBox, zeroize::Zeroize};
use serde::{Deserialize, Serialize, Serializer};
use std::sync::LazyLock;

pub use secrecy::{ExposeSecret, SerializableSecret};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(transparent)]
pub struct SecretString(SecretBox<SecretValue>);

impl Default for SecretString {
    fn default() -> Self {
        Self::from(String::new())
    }
}

impl From<String> for SecretString {
    fn from(value: String) -> Self {
        Self(SecretBox::new(Box::new(SecretValue(value))))
    }
}

impl From<&str> for SecretString {
    fn from(value: &str) -> Self {
        Self::from(value.to_owned())
    }
}

impl ExposeSecret<str> for SecretString {
    fn expose_secret(&self) -> &str {
        &self.0.expose_secret().0
    }
}

#[derive(Clone, Deserialize)]
#[serde(transparent)]
struct SecretValue(String);

impl Zeroize for SecretValue {
    fn zeroize(&mut self) {
        self.0.zeroize();
    }
}

impl secrecy::CloneableSecret for SecretValue {}

impl Serialize for SecretValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str("[REDACTED]")
    }
}

impl SerializableSecret for SecretValue {}

const SERVICE: &str = "koharu";

#[cfg(target_os = "linux")]
mod hosted;

static CREDENTIAL_STORE: LazyLock<Result<(), String>> = LazyLock::new(|| {
    #[cfg(target_os = "linux")]
    {
        linux_keyutils_keyring_store::Store::new()
            .map(|store| keyring_core::set_default_store(store))
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "linux"))]
    Ok(())
});

/// Load a Koharu secret by key, returning `None` when no credential exists.
pub fn get(key: &str) -> anyhow::Result<Option<SecretString>> {
    #[cfg(target_os = "linux")]
    if let Some(store) = hosted::Store::from_environment()? {
        return store.get(key);
    }
    let entry = entry(key)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(SecretString::from(value))),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Store a Koharu secret by key.
pub fn set(key: &str, secret: &SecretString) -> anyhow::Result<()> {
    #[cfg(target_os = "linux")]
    if let Some(store) = hosted::Store::from_environment()? {
        return store.set(key, secret);
    }
    entry(key)?.set_password(secret.expose_secret())?;
    Ok(())
}

/// Delete a Koharu secret by key. Missing credentials are treated as success.
pub fn delete(key: &str) -> anyhow::Result<()> {
    #[cfg(target_os = "linux")]
    if let Some(store) = hosted::Store::from_environment()? {
        return store.delete(key);
    }
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn entry(key: &str) -> anyhow::Result<Entry> {
    let namespace = match std::env::var("KOHARU_SECRET_NAMESPACE") {
        Ok(value) => Some(value),
        Err(std::env::VarError::NotPresent) => None,
        Err(_) => anyhow::bail!("invalid credential namespace"),
    };
    let service = service_name(namespace.as_deref())?;
    match &*CREDENTIAL_STORE {
        Ok(()) => {},
        Err(error) => anyhow::bail!("failed to initialize Linux Keyutils: {error}"),
    }
    #[cfg(target_os = "linux")]
    let entry = Entry::new(&service, key)?;
    #[cfg(not(target_os = "linux"))]
    let entry = keyring::Entry::new(&service, key)?.inner;
    Ok(entry)
}

// Hosted identities share an OS account but never a credential service.
fn service_name(namespace: Option<&str>) -> anyhow::Result<String> {
    let Some(namespace) = namespace else {
        return Ok(SERVICE.to_owned());
    };
    anyhow::ensure!(
        namespace.len() == 64
            && namespace.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
        "invalid credential namespace"
    );
    Ok(format!("{SERVICE}:{namespace}"))
}

#[cfg(test)]
mod tests {
    use super::service_name;

    #[test]
    fn hosted_identities_have_distinct_credential_services() {
        let alice = "a".repeat(64);
        let bob = "b".repeat(64);
        assert_ne!(service_name(Some(&alice)).unwrap(), service_name(Some(&bob)).unwrap());
        assert_ne!(service_name(Some(&alice)).unwrap(), service_name(None).unwrap());
        assert_eq!(service_name(None).unwrap(), "koharu");
    }

    #[test]
    fn invalid_hosted_namespaces_never_fall_back_to_the_shared_service() {
        for namespace in ["", "../other", "alice", &"A".repeat(64), &"g".repeat(64)] {
            assert!(service_name(Some(namespace)).is_err());
        }
    }
}
