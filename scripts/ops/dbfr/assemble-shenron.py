import json, pathlib, shutil, sys, yaml
old = pathlib.Path("/srv/shenron/current").resolve()
sha, image = sys.argv[1], sys.argv[2]
new = pathlib.Path("/srv/shenron/releases/docker-" + sha)
assert not new.exists(), new
manifest = json.loads((old / "release.json").read_text())
new.mkdir()
for rel in manifest["files"]:
    dst = new / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(old / rel, dst)
compose = yaml.safe_load((new / "compose.yaml").read_text())
override_path = pathlib.Path("/srv/shenron/shared/debate/guild-admission.override.json")
override = (yaml.safe_load(override_path.read_text()) or {}) if override_path.is_file() else {}
for name in ("site", "bot"):
    service = compose["services"][name]
    service["image"] = image
    extra = ((override.get("services") or {}).get(name) or {}).get("environment") or {}
    service.setdefault("environment", {}).update({k: str(v) for k, v in extra.items()})
text = (json.dumps(compose, indent=2) + "\n").replace(old.name, new.name)
(new / "compose.yaml").write_text(text)
print(json.dumps({"old": old.name, "new": str(new), "images": manifest["images"], "vfs": manifest["publicVfs"]["path"]}))
