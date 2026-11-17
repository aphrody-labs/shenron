import json, os, pathlib, shutil, sys, yaml
root = pathlib.Path(os.environ.get("SHENRON_ROOT") or sys.exit("set SHENRON_ROOT (host root of the production layout, see deploy/README.md)"))
old = (root / "current").resolve()
sha, image = sys.argv[1], sys.argv[2]
new = root / "releases" / ("docker-" + sha)
assert not new.exists(), new
manifest = json.loads((old / "release.json").read_text())
new.mkdir()
for rel in manifest["files"]:
    dst = new / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(old / rel, dst)
compose = yaml.safe_load((new / "compose.yaml").read_text())
override_path = root / "shared" / "debate" / "guild-admission.override.json"
override = (yaml.safe_load(override_path.read_text()) or {}) if override_path.is_file() else {}
for name in ("site", "bot"):
    service = compose["services"][name]
    service["image"] = image
    extra = ((override.get("services") or {}).get(name) or {}).get("environment") or {}
    service.setdefault("environment", {}).update({k: str(v) for k, v in extra.items()})
site = compose["services"]["site"]
releases = root / "shared" / "releases"
site.setdefault("environment", {})["SHENRON_RELEASES_DIR"] = str(releases)
mounts = site.setdefault("volumes", [])
if not any(m.get("target") == str(releases) for m in mounts):
    mounts.append({"type": "bind", "source": str(releases.resolve()), "target": str(releases), "read_only": True})
text = (json.dumps(compose, indent=2) + "\n").replace(old.name, new.name)
(new / "compose.yaml").write_text(text)
print(json.dumps({"old": old.name, "new": str(new), "images": manifest["images"], "vfs": manifest["publicVfs"]["path"]}))
