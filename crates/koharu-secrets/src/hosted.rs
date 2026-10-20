//! Private credential files for hosted Linux sessions, where kernel keyrings are unavailable.

use std::{
    fs::{self, File, OpenOptions},
    io::{Read as _, Write as _},
    os::unix::fs::{
        DirBuilderExt as _, MetadataExt as _, OpenOptionsExt as _, PermissionsExt as _,
    },
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use anyhow::{Context as _, Result, ensure};

use crate::{ExposeSecret as _, SecretString, service_name};

const MAX_SECRET_BYTES: u64 = 65536;
static NEXT_WRITE: AtomicU64 = AtomicU64::new(0);

pub(super) struct Store {
    root: PathBuf,
    owner: u32,
}

impl Store {
    pub(super) fn from_environment() -> Result<Option<Self>> {
        let namespace = match std::env::var("KOHARU_SECRET_NAMESPACE") {
            Ok(value) => value,
            Err(std::env::VarError::NotPresent) => return Ok(None),
            Err(_) => anyhow::bail!("invalid credential namespace"),
        };
        let home = std::env::var_os("SHENRON_HOME").context("hosted credential home is missing")?;
        Self::new(Path::new(&home), &namespace).map(Some)
    }

    fn new(home: &Path, namespace: &str) -> Result<Self> {
        service_name(Some(namespace))?;
        ensure!(home.is_absolute(), "hosted credential home must be absolute");
        ensure!(
            home.file_name().and_then(|name| name.to_str()) == Some(namespace),
            "credential home does not match its account"
        );
        ensure!(fs::canonicalize(home)? == home, "credential home must be canonical");
        let metadata = fs::symlink_metadata(home)?;
        ensure!(
            metadata.is_dir()
                && !metadata.file_type().is_symlink()
                && metadata.permissions().mode() & 0o077 == 0,
            "credential home must be private"
        );
        let owner = metadata.uid();
        let root = home.join(".credentials");
        match fs::DirBuilder::new().mode(0o700).create(&root) {
            Ok(()) => {},
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {},
            Err(error) => return Err(error.into()),
        }
        let metadata = fs::symlink_metadata(&root)?;
        ensure!(
            metadata.is_dir()
                && !metadata.file_type().is_symlink()
                && metadata.uid() == owner
                && metadata.permissions().mode() & 0o077 == 0
                && fs::canonicalize(&root)? == root,
            "credential directory must be private"
        );
        Ok(Self { root, owner })
    }

    fn path(&self, key: &str) -> Result<PathBuf> {
        let metadata = fs::symlink_metadata(&self.root)?;
        ensure!(
            metadata.is_dir()
                && !metadata.file_type().is_symlink()
                && metadata.uid() == self.owner
                && metadata.permissions().mode() & 0o077 == 0
                && fs::canonicalize(&self.root)? == self.root,
            "credential directory must be private"
        );
        ensure!(
            !key.is_empty()
                && key.len() <= 128
                && key
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')),
            "invalid credential key"
        );
        Ok(self.root.join(key))
    }

    fn metadata(&self, path: &Path) -> Result<Option<fs::Metadata>> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        ensure!(
            metadata.is_file()
                && !metadata.file_type().is_symlink()
                && metadata.nlink() == 1
                && metadata.uid() == self.owner
                && metadata.permissions().mode() & 0o077 == 0
                && metadata.len() <= MAX_SECRET_BYTES,
            "credential file must be private"
        );
        Ok(Some(metadata))
    }

    pub(super) fn get(&self, key: &str) -> Result<Option<SecretString>> {
        let path = self.path(key)?;
        let Some(expected) = self.metadata(&path)? else { return Ok(None) };
        let file = File::open(&path)?;
        let actual = file.metadata()?;
        ensure!(
            actual.dev() == expected.dev() && actual.ino() == expected.ino(),
            "credential file changed while opening"
        );
        let mut value = String::new();
        file.take(MAX_SECRET_BYTES + 1).read_to_string(&mut value)?;
        ensure!(value.len() as u64 <= MAX_SECRET_BYTES, "credential is too large");
        Ok(Some(SecretString::from(value)))
    }

    pub(super) fn set(&self, key: &str, secret: &SecretString) -> Result<()> {
        let path = self.path(key)?;
        self.metadata(&path)?;
        let value = secret.expose_secret();
        ensure!(value.len() as u64 <= MAX_SECRET_BYTES, "credential is too large");
        let temporary = self.root.join(format!(
            ".write-{}-{}",
            std::process::id(),
            NEXT_WRITE.fetch_add(1, Ordering::Relaxed)
        ));
        let mut file =
            OpenOptions::new().write(true).create_new(true).mode(0o600).open(&temporary)?;
        let result = (|| -> Result<()> {
            file.write_all(value.as_bytes())?;
            file.sync_all()?;
            fs::rename(&temporary, &path)?;
            File::open(&self.root)?.sync_all()?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub(super) fn delete(&self, key: &str) -> Result<()> {
        let path = self.path(key)?;
        if self.metadata(&path)?.is_some() {
            fs::remove_file(path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "koharu-hosted-secrets-{}-{}",
                std::process::id(),
                NEXT_WRITE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::DirBuilder::new().mode(0o700).create(&path).unwrap();
            Self(fs::canonicalize(path).unwrap())
        }
        fn account(&self, namespace: &str) -> PathBuf {
            let path = self.0.join(namespace);
            fs::DirBuilder::new().mode(0o700).create(&path).unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn hosted_accounts_keep_credentials_isolated_and_persistent() {
        let fixture = Fixture::new();
        let alice = "a".repeat(64);
        let bob = "b".repeat(64);
        let alice_home = fixture.account(&alice);
        let bob_home = fixture.account(&bob);
        let first = Store::new(&alice_home, &alice).unwrap();
        let second = Store::new(&bob_home, &bob).unwrap();
        first.set("openai", &SecretString::from("alice-fixture")).unwrap();
        assert!(second.get("openai").unwrap().is_none());
        second.set("openai", &SecretString::from("bob-fixture")).unwrap();
        assert_eq!(
            Store::new(&alice_home, &alice)
                .unwrap()
                .get("openai")
                .unwrap()
                .unwrap()
                .expose_secret(),
            "alice-fixture"
        );
        first.set("openai", &SecretString::from("alice-updated")).unwrap();
        assert_eq!(first.get("openai").unwrap().unwrap().expose_secret(), "alice-updated");
        first.delete("openai").unwrap();
        first.delete("openai").unwrap();
        assert_eq!(second.get("openai").unwrap().unwrap().expose_secret(), "bob-fixture");
        assert!(Store::new(&alice_home, &bob).is_err());
    }

    #[test]
    fn hosted_credentials_reject_links_broad_permissions_and_unsafe_keys() {
        let fixture = Fixture::new();
        let namespace = "a".repeat(64);
        let home = fixture.account(&namespace);
        let store = Store::new(&home, &namespace).unwrap();
        for key in ["", "../other", "nested/key"] {
            assert!(store.set(key, &SecretString::from("fixture")).is_err());
        }
        let outside = fixture.0.join("outside");
        fs::write(&outside, "outside-fixture").unwrap();
        let linked = store.root.join("linked");
        std::os::unix::fs::symlink(&outside, &linked).unwrap();
        assert!(store.get("linked").is_err());
        assert!(store.set("linked", &SecretString::from("replacement")).is_err());
        assert!(store.delete("linked").is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "outside-fixture");
        store.set("broad", &SecretString::from("fixture")).unwrap();
        fs::set_permissions(store.root.join("broad"), fs::Permissions::from_mode(0o644)).unwrap();
        assert!(store.get("broad").is_err());
        fs::set_permissions(&store.root, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(Store::new(&home, &namespace).is_err());
        assert!(store.get("missing").is_err());
        assert!(store.set("missing", &SecretString::from("fixture")).is_err());
        assert!(store.delete("missing").is_err());
        fs::set_permissions(&store.root, fs::Permissions::from_mode(0o700)).unwrap();
        fs::rename(&store.root, home.join("saved-credentials")).unwrap();
        std::os::unix::fs::symlink(&fixture.0, &store.root).unwrap();
        assert!(store.get("outside").is_err());
        assert!(store.set("outside", &SecretString::from("replacement")).is_err());
        assert!(store.delete("outside").is_err());
        assert_eq!(fs::read_to_string(outside).unwrap(), "outside-fixture");
    }
}
