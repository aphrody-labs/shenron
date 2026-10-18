import asyncio
import os
import sys
from playwright.async_api import async_playwright

async def main():
    out_dir = os.path.join(os.getcwd(), "var", "reports", "crunchyroll-capture")
    os.makedirs(out_dir, exist_ok=True)

    user_data_dir = r"C:\Users\omara\AppData\Local\Google\Chrome\User Data Staged"
    print(f"[Capture-Py] Launching Chrome context with staged profile: {user_data_dir}")

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            channel="chrome",
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
            viewport={"width": 1920, "height": 1080}
        )

        urls = [
            ("cr-beerus-series", "https://www.crunchyroll.com/fr/series/GT00389311/dragon-ball-super-beerus"),
            ("cr-beerus-ep1", "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"),
            ("dbfr-episodes-index", "https://dragonballfr.com/wiki/episodes"),
            ("dbfr-episode-875", "https://dragonballfr.com/wiki/episodes/875")
        ]

        for name, url in urls:
            print(f"[Capture-Py] Navigating to {url}...")
            page = await context.new_page()
            try:
                await page.goto(url, wait_until="networkidle", timeout=60000)
                await page.wait_for_timeout(4000)
                
                screenshot_path = os.path.join(out_dir, f"{name}.png")
                await page.screenshot(path=screenshot_path)
                print(f"[Capture-Py] Screenshot: {screenshot_path}")

                html_path = os.path.join(out_dir, f"{name}.html")
                content = await page.content()
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(content)

                title = await page.title()
                print(f"[Capture-Py] Title: {title}")
            except Exception as e:
                print(f"[Capture-Py] Error on {url}: {e}")
            finally:
                await page.close()

        await context.close()
        print("[Capture-Py] All pages captured successfully!")

if __name__ == "__main__":
    asyncio.run(main())
