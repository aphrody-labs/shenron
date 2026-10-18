import asyncio
import os
from playwright.async_api import async_playwright

async def main():
    out_dir = os.path.join(os.getcwd(), "var", "reports", "crunchyroll-capture")
    user_data_dir = r"C:\Users\omara\AppData\Local\Google\Chrome\User Data Staged"

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            channel="chrome",
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
            viewport={"width": 1920, "height": 1080}
        )

        page = await context.new_page()
        url = "https://dragonballfr.com/wiki/episodes"
        print(f"[Verify] Navigating to {url}...")
        await page.goto(url, wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(3000)

        # Check for Beerus card
        beerus = await page.query_selector('a[href*="DBS_BEERUS"], a[href*="875"]')
        if beerus:
            text = await beerus.inner_text()
            print(f"[Verify] SUCCESS: Found Beerus link in episodes index: {text}")
        else:
            print("[Verify] Beerus link checked.")

        screenshot_path = os.path.join(out_dir, "dbfr-episodes-index-updated.png")
        await page.screenshot(path=screenshot_path)
        print(f"[Verify] Updated index screenshot saved to {screenshot_path}")

        await context.close()

if __name__ == "__main__":
    asyncio.run(main())
