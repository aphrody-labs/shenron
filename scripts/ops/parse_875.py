from bs4 import BeautifulSoup
import json

with open("var/reports/crunchyroll-capture/dbfr-episode-875.html", "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f.read(), "html.parser")

title = soup.title.string if soup.title else ""
h1 = soup.find("h1").get_text(strip=True) if soup.find("h1") else ""
metadata = {}
for meta in soup.find_all("meta"):
    if meta.get("property"):
        metadata[meta["property"]] = meta.get("content")
    elif meta.get("name"):
        metadata[meta["name"]] = meta.get("content")

scripts = [s.string for s in soup.find_all("script", type="application/ld+json") if s.string]

print("PAGE TITLE:", title)
print("H1:", h1)
print("JSON-LD:", scripts)
print("OG:TITLE:", metadata.get("og:title"))
print("OG:DESCRIPTION:", metadata.get("og:description"))
print("OG:IMAGE:", metadata.get("og:image"))
