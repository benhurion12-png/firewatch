import json
import os
import random
import time
import urllib.request
import uuid
import zlib
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

random.seed(42)
DEMO_SCENARIOS = {"burabay": "normal", "ile-alatau": "drying", "karkaraly": "fire"}
API_URL = os.getenv("SIMULATOR_API_URL")
TOKEN = os.getenv("SIMULATOR_TOKEN", "")
INTERVAL = max(1, float(os.getenv("INTERVAL_SECONDS", "60")))
static_stations = json.loads(os.getenv("SIMULATOR_STATIONS", json.dumps([{"prefix": p, "scenario": s} for p, s in DEMO_SCENARIOS.items()])))
static_scenarios = {s["prefix"]: s["scenario"] for s in static_stations}

def fetch_areas():
    """area id -> {sensor type: device id}. Registered devices are picked up automatically when the API is configured."""
    if not API_URL:
        return {s["prefix"]: {"HMP155": s["prefix"] + "-hmp155", "FS24X": s["prefix"] + "-fs24x"} for s in static_stations}
    request = urllib.request.Request(API_URL, headers={"x-simulator-token": TOKEN})
    with urllib.request.urlopen(request, timeout=5) as response:
        areas = {}
        for row in json.load(response):
            areas.setdefault(row["areaId"], {})[row["type"]] = row["id"]
        return areas

def scenario_of(area_id):
    override = os.getenv("SCENARIO", "mixed")
    if override != "mixed":
        return override
    return static_scenarios.get(area_id) or DEMO_SCENARIOS.get(area_id) or os.getenv("DEFAULT_SCENARIO", "normal")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="firewatch-simulator")
if os.getenv("MQTT_USERNAME"):
    client.username_pw_set(os.environ["MQTT_USERNAME"], os.getenv("MQTT_PASSWORD"))
while True:
    try:
        client.connect(os.getenv("MQTT_HOST", "localhost"), int(os.getenv("MQTT_PORT", "1885")), 60)
        break
    except OSError:
        time.sleep(3)
client.loop_start()
started = time.monotonic()
areas, last_fetch, due = {}, -1e9, {}
try:
    while True:
        now = time.monotonic()
        if now - last_fetch >= 10:
            last_fetch = now
            try:
                areas = fetch_areas()
            except (OSError, ValueError) as exc:
                print("Device list unavailable, keeping the previous one:", exc, flush=True)
        phase = ((now - started) % 360) / 360
        for area_id, devices in areas.items():
            if due.get(area_id, 0) > now:
                continue
            due[area_id] = now + INTERVAL
            scenario = scenario_of(area_id)
            severity = 0 if scenario == "normal" else min(1, phase * 3)
            # Areas outside the built-in demo get a stable personal offset so they do not look identical.
            offset = 0 if area_id in DEMO_SCENARIOS else (zlib.crc32(area_id.encode()) % 700) / 100 - 3.5
            temperature = round(23 + offset + severity * 24 + random.uniform(-0.25, 0.25), 2)
            humidity = round(59 - offset * 1.5 - severity * 43 + random.uniform(-0.4, 0.4), 2)
            for sensor, device_id in devices.items():
                if scenario == "offline" and sensor == "FS24X":
                    continue
                message = dict(message_id=str(uuid.uuid4()), device_id=device_id, sensor_type=sensor,
                               timestamp=datetime.now(timezone.utc).isoformat(), simulated=True,
                               fault=scenario == "fault" and sensor == "FS24X",
                               metrics=dict(temperature_c=temperature, humidity_pct=humidity) if sensor == "HMP155"
                               else dict(flame_detected=scenario == "fire" and phase > 0.4))
                result = client.publish(f"firewatch/nodes/{device_id}/telemetry", json.dumps(message), qos=1, retain=False)
                result.wait_for_publish(timeout=10)
        time.sleep(1)
finally:
    client.loop_stop()
    client.disconnect()
