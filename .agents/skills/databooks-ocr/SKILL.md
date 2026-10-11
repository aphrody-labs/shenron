---
name: databooks-ocr
description: Transcribe Dragon Ball databook scans to Japanese JSONL while respecting the editorial freeze and Shenron's scan-only OCR contract.
metadata:
  short-description: Databook scan transcription
---

# Shenron databook OCR

Before doing any OCR work, read the canonical project instructions in [plugin/skills/databooks-ocr/SKILL.md](../../../plugin/skills/databooks-ocr/SKILL.md) and its linked references. Keep that file as the single source of the OCR contract. Then read `AGENTS.md` and `GOAL.md`; the databook freeze in `docs/reference/root/PLAN.md` takes precedence over any OCR task, and no OCR, translation, or deposit runs while it is active.
