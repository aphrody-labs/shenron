---
name: source-of-truth
description: "Read version-pinned parent code and docs before relying on this plugin's commands or capabilities; check the source snapshot and report any guidance drift."
---

# Source of truth

Read [parent source inventory](../../references/upstream-main.md) and its linked
code/docs before using instructions from this plugin. The JSON inventory records
parent main commit IDs and SHA-256 hashes. Missing source paths are unavailable,
never proof of a capability. Local unversioned sources require manual verification.
If existing guidance contradicts the source, follow the current owner source,
correct the guidance and run the owner's validation. Automated sync updates
reference snapshots and Git history; it does not validate every prose claim.
