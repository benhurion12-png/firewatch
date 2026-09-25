"""Browser integration test against test/ui-server.cjs + Next production server."""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".test-results"
OUTPUT.mkdir(exist_ok=True)
SUFFIX = str(int(time.time()))
AREA = "UI test forest " + SUFFIX

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="msedge")
    context = browser.new_context(viewport={"width": 1440, "height": 1060}, color_scheme="light")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://localhost:3002/login")
    page.get_by_label("Email", exact=True).fill("manager@firewatch.local")
    page.get_by_label("Пароль", exact=True).fill("ChangeMe-Manager-2026!")
    page.get_by_role("button", name="Войти в FireWatch").click()
    expect(page.get_by_role("heading", name="Лес под наблюдением")).to_be_visible(timeout=30000)
    expect(page.get_by_role("link", name="Бурабай", exact=False).first).to_be_visible()
    expect(page.locator(".connection-note .status-dot.online")).to_be_visible(timeout=15000)
    expect(page.locator(".map-marker").first).to_be_visible(timeout=15000)
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUTPUT / "dashboard-light.png"), full_page=True)
    page.get_by_role("button", name="Переключить тему").click()
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    page.screenshot(path=str(OUTPUT / "dashboard-dark.png"), full_page=True)
    page.reload()
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    page.goto("http://localhost:3002/areas")
    page.get_by_role("button", name="Добавить участок", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Название", exact=True).fill(AREA)
    dialog.get_by_label("Регион", exact=True).fill("Тестовая область")
    dialog.get_by_label("Широта", exact=True).fill("50.1")
    dialog.get_by_label("Долгота", exact=True).fill("72.2")
    dialog.get_by_label("Площадь, га", exact=True).fill("10")
    dialog.get_by_role("button", name="Сохранить участок").click()
    expect(page.get_by_role("heading", name=AREA)).to_be_visible()
    page.goto("http://localhost:3002/devices")
    page.get_by_role("button", name="Добавить датчик", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("MQTT ID", exact=False).fill("ui-test-hmp-"+SUFFIX)
    dialog.get_by_label("Название", exact=True).fill("UI датчик HMP155 "+SUFFIX)
    dialog.locator("select[name=areaId]").select_option(label=AREA)
    dialog.get_by_role("button", name="Сохранить датчик").click()
    expect(page.get_by_text("UI датчик HMP155 "+SUFFIX, exact=True)).to_be_visible()
    page.goto("http://localhost:3002/areas/karkaraly")
    expect(page.get_by_role("heading", name="Каркаралы · Восточный лес")).to_be_visible()
    expect(page.get_by_text("Критический", exact=True).first).to_be_visible()
    page.screenshot(path=str(OUTPUT / "area-dark.png"), full_page=True)
    page.goto("http://localhost:3002/authors")
    for name in ["Кадыргалиева", "Карымсакова", "Сәбит"]:
        expect(page.get_by_role("heading", name=name, exact=True)).to_be_visible()
    page.screenshot(path=str(OUTPUT / "authors-dark.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    for route in ["/", "/areas", "/devices", "/events", "/authors", "/methodology", "/areas/karkaraly"]:
        page.goto("http://localhost:3002" + route)
        expect(page.locator("main h1")).to_be_visible(timeout=15000)
        overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
        assert not overflow, "Horizontal page overflow: " + route
    page.goto("http://localhost:3002/")
    expect(page.get_by_role("heading", name="Лес под наблюдением")).to_be_visible()
    page.screenshot(path=str(OUTPUT / "dashboard-mobile.png"), full_page=True)
    page.get_by_role("button",name="Выйти",exact=True).click()
    expect(page.get_by_role("button",name="Войти в FireWatch")).to_be_visible()
    assert not errors, errors
    print(json.dumps({"browser": "Edge (Chromium)", "result": "PASS", "screenshots": 5,
                      "flows": ["login", "theme persistence", "manager creates area",
                                "manager assigns sensor", "critical telemetry", "authors",
                                "seven mobile pages without overflow"],
                      "page_errors": errors}, ensure_ascii=False))
    browser.close()
