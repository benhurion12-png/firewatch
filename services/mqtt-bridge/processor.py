import json
import math
import re
from datetime import datetime, timezone

def normalize(topic, raw):
    if len(raw) > 16384:
        raise ValueError("Oversized packet")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Expected object")
    device_id = payload.get("device_id")
    if not isinstance(device_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", device_id):
        raise ValueError("Invalid device_id")
    if topic != f"firewatch/nodes/{device_id}/telemetry":
        raise ValueError("Topic and device ID mismatch")
    sensor_type = payload.get("sensor_type")
    if sensor_type not in ("HMP155", "FS24X"):
        raise ValueError("Unsupported sensor_type")
    timestamp = datetime.fromisoformat(payload["timestamp"].replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("Timezone required")
    age = (datetime.now(timezone.utc)-timestamp).total_seconds()
    if age < -5 or age > 86400:
        raise ValueError("Timestamp outside window")
    message_id = payload.get("message_id")
    if not isinstance(message_id, str) or not 8 <= len(message_id) <= 100:
        raise ValueError("Invalid message_id")
    metrics = payload.get("metrics")
    if not isinstance(metrics, dict):
        raise ValueError("Expected metrics")
    fault, simulated = payload.get("fault"), payload.get("simulated")
    if type(fault) is not bool or type(simulated) is not bool:
        raise ValueError("fault and simulated must be booleans")
    result = dict(messageId=message_id, deviceId=device_id, type=sensor_type,
                  measuredAt=timestamp.isoformat(), fault=fault, simulated=simulated)
    if sensor_type == "HMP155":
        for source, target, low, high in (("temperature_c", "temperatureC", -80, 60), ("humidity_pct", "humidityPct", 0, 100)):
            value = metrics.get(source)
            if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
                raise ValueError("Invalid " + source)
            result[target] = value
    else:
        if type(metrics.get("flame_detected")) is not bool:
            raise ValueError("Invalid flame_detected")
        result["flameDetected"] = metrics["flame_detected"]
    return result
