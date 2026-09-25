import json
import unittest
from datetime import datetime, timezone
from processor import normalize

class ProcessorTests(unittest.TestCase):
    def packet(self, **changes):
        value = dict(message_id="test-message-1", device_id="test-hmp155",
                     sensor_type="HMP155", timestamp=datetime.now(timezone.utc).isoformat(),
                     fault=False, simulated=True, metrics=dict(temperature_c=24, humidity_pct=55))
        value.update(changes)
        return json.dumps(value).encode()

    def test_valid(self):
        self.assertEqual(normalize("firewatch/nodes/test-hmp155/telemetry", self.packet())["temperatureC"], 24)

    def test_id_spoof(self):
        with self.assertRaises(ValueError):
            normalize("firewatch/nodes/other/telemetry", self.packet())

    def test_bad_ranges(self):
        for value in (-81, 61, float("nan"), "24", True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize("firewatch/nodes/test-hmp155/telemetry", self.packet(metrics=dict(temperature_c=value, humidity_pct=55)))

    def test_naive_time(self):
        with self.assertRaises(ValueError):
            normalize("firewatch/nodes/test-hmp155/telemetry", self.packet(timestamp="2026-09-25T10:00:00"))

    def test_false_is_a_valid_flame_reading(self):
        value = normalize("firewatch/nodes/test-hmp155/telemetry", self.packet(sensor_type="FS24X", metrics=dict(flame_detected=False)))
        self.assertIs(value["flameDetected"], False)

    def test_fault_must_be_boolean(self):
        with self.assertRaises(ValueError):
            normalize("firewatch/nodes/test-hmp155/telemetry", self.packet(fault="false"))

if __name__ == "__main__":
    unittest.main()
