import json
import os
import random
import time
import uuid
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

random.seed(42)
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
stations = json.loads(os.getenv("SIMULATOR_STATIONS", '[{"prefix":"burabay","scenario":"normal"},{"prefix":"ile-alatau","scenario":"drying"},{"prefix":"karkaraly","scenario":"fire"}]'))
started = time.monotonic()
try:
    while True:
        phase = ((time.monotonic()-started) % 360) / 360
        for station in stations:
            scenario = os.getenv("SCENARIO", "mixed")
            if scenario == "mixed":
                scenario = station["scenario"]
            severity = 0 if scenario == "normal" else min(1, phase*3)
            temperature = round(23 + severity*24 + random.uniform(-0.25, 0.25), 2)
            humidity = round(59 - severity*43 + random.uniform(-0.4, 0.4), 2)
            for sensor in ("HMP155", "FS24X"):
                device_id = station["prefix"]+"-"+sensor.lower()
                if scenario == "offline" and sensor == "FS24X":
                    continue
                message = dict(message_id=str(uuid.uuid4()), device_id=device_id, sensor_type=sensor,
                               timestamp=datetime.now(timezone.utc).isoformat(), simulated=True,
                               fault=scenario == "fault" and sensor == "FS24X",
                               metrics=dict(temperature_c=temperature, humidity_pct=humidity) if sensor == "HMP155"
                               else dict(flame_detected=scenario == "fire" and phase > 0.4))
                result = client.publish(f"firewatch/nodes/{device_id}/telemetry", json.dumps(message), qos=1, retain=False)
                result.wait_for_publish(timeout=10)
        time.sleep(max(1, float(os.getenv("INTERVAL_SECONDS", "5"))))
finally:
    client.loop_stop()
    client.disconnect()
