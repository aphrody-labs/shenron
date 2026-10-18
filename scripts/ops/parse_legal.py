from bs4 import BeautifulSoup

with open("var/reports/crunchyroll-capture/dbfr-episode-875.html", "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f.read(), "html.parser")

links = [a.get("href") for a in soup.find_all("a", href=True) if "crunchyroll" in a.get("href")]
print("CRUNCHYROLL LINKS:", links)

legal = soup.find_all(lambda tag: tag.name in ["div", "section", "a"] and "offre" in (tag.get("class") or []))
print("LEGAL SECTIONS:", len(legal))
