"""Verify the real Docker MQTT -> Redpanda -> PostgreSQL -> UI pipeline.
Run against the demo profile. Publishes a labelled synthetic HMP155 packet twice.
Credentials stay local and are never printed.
"""
import argparse
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.request
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
config = dict(line.split("=", 1) for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
              if "=" in line and not line.lstrip().startswith("#"))
parser = argparse.ArgumentParser()
parser.add_argument("--browser", action="store_true")
options = parser.parse_args()
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request("http://localhost:3002/api" + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with client.open(req, timeout=15) as response:
        return json.load(response)

health = request("/health")
assert health["status"] == "ok" and health["brokerConnected"], health
user = request("/auth/login", {"email": config["ADMIN_EMAIL"], "password": config["ADMIN_PASSWORD"]})
assert user["role"] == "ADMIN"
dashboard = request("/dashboard")
demo_ids = {"burabay", "ile-alatau", "karkaraly"}
areas = [area for area in dashboard["areas"] if area["id"] in demo_ids]
assert len(areas) == 3
assert all(len(area["devices"]) == 2 and area["risk"]["quality"] == "COMPLETE" for area in areas)
assert all(device["lastReading"] and device["lastReading"]["simulated"]
           for area in areas for device in area["devices"])
assert all((datetime.now(timezone.utc) - datetime.fromisoformat(device["lastReading"]["measuredAt"].replace("Z", "+00:00"))).total_seconds() < 90
           for area in areas for device in area["devices"])

message_id = str(uuid.uuid4())
packet = {
    "message_id": message_id, "device_id": "burabay-hmp155", "sensor_type": "HMP155",
    "timestamp": datetime.now(timezone.utc).isoformat(), "fault": False, "simulated": True,
    "metrics": {"temperature_c": 24.5, "humidity_pct": 55.0},
}
publisher = 'import sys; import paho.mqtt.publish as p; p.single(sys.argv[1],sys.stdin.read(),hostname="mosquitto",port=1883,qos=1)'
for _ in range(2):
    subprocess.run(["docker", "compose", "exec", "-T", "mqtt-bridge", "python", "-c",
                    publisher, "firewatch/nodes/burabay-hmp155/telemetry"],
                   cwd=ROOT, input=json.dumps(packet), text=True, check=True, capture_output=True)
deadline = time.monotonic() + 25
while True:
    readings = request("/areas/burabay")["readings"]
    matches = [row for row in readings if row["messageId"] == message_id]
    if matches:
        assert len(matches) == 1
        assert matches[0]["temperatureC"] == 24.5 and matches[0]["humidityPct"] == 55
        break
    if time.monotonic() > deadline:
        raise AssertionError("Published MQTT packet did not reach persisted area history")
    time.sleep(1)
print("PASS: Docker health, broker connected, admin login, 3 areas, 6 fresh sensors, real MQTT ingestion and duplicate protection.")

if options.browser:
    from playwright.sync_api import sync_playwright, expect
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="msedge")
        page = browser.new_page(viewport={"width": 1440, "height": 1050})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://localhost:3002/login")
        page.get_by_label("Email", exact=True).fill(config["ADMIN_EMAIL"])
        page.get_by_label("Пароль", exact=True).fill(config["ADMIN_PASSWORD"])
        page.get_by_role("button", name="Войти в FireWatch").click()
        expect(page.get_by_role("heading", name="Лес под наблюдением")).to_be_visible(timeout=20000)
        expect(page.locator(".connection-note .status-dot.online")).to_be_visible(timeout=15000)
        expect(page.locator(".map-marker").first).to_be_visible(timeout=15000)
        expect(page.get_by_role("alert")).to_have_count(0)
        before = request("/areas/burabay")["readings"][0]["measuredAt"]
        deadline = time.monotonic() + 90
        after = before
        while after == before and time.monotonic() < deadline:
            page.wait_for_timeout(3000)
            after = request("/areas/burabay")["readings"][0]["measuredAt"]
        assert before != after, "Simulator stopped producing readings"
        output = ROOT / ".test-results"
        output.mkdir(exist_ok=True)
        page.screenshot(path=str(output / "docker-dashboard.png"), full_page=True)
        assert not errors, errors
        browser.close()
    print("PASS: Docker frontend login, live Socket.IO connection, map, continuous telemetry and no JavaScript errors.")
