import json

for db_id, fname in [
    (9, "/mnt/c/Users/omara/.gemini/antigravity-cli/brain/bbccea5d-7544-404d-91be-e40c93b9454f/.system_generated/steps/42/output.txt"),
    (6, "/mnt/c/Users/omara/.gemini/antigravity-cli/brain/bbccea5d-7544-404d-91be-e40c93b9454f/.system_generated/steps/12/output.txt")
]:
    data = json.load(open(fname, encoding='utf-8'))
    for p in data.get("pages", []):
        t = p.get("text", "")
        for line in t.split("\n"):
            if any(term in line for term in ["50倍", "超サイヤ人2", "超サイヤ人3", "掛け算", "フュージョン"]):
                print(f"DB {db_id} P{p.get('number')}: {line.strip()}")
