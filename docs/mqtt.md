# MQTT-контракт FireWatch

Брокер локально: localhost:1885. В Docker-сети: mosquitto:1883.
Topic: `firewatch/nodes/{device_id}/telemetry`. QoS 1, retain=false.
ID должен совпадать с зарегистрированным устройством и сегментом topic.

## HMP155

```json
{
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "burabay-hmp155",
  "sensor_type": "HMP155",
  "timestamp": "2026-09-25T10:00:00Z",
  "fault": false,
  "simulated": false,
  "metrics": {"temperature_c": 24.5, "humidity_pct": 54.2}
}
```

## FS24X

```json
{
  "message_id": "550e8400-e29b-41d4-a716-446655440001",
  "device_id": "burabay-fs24x",
  "sensor_type": "FS24X",
  "timestamp": "2026-09-25T10:00:00Z",
  "fault": false,
  "simulated": false,
  "metrics": {"flame_detected": false}
}
```

Заменяйте timestamp текущим UTC временем, message_id уникальным UUID каждого нового измерения. При повторной передаче **сохраняйте прежний message_id**, чтобы не дублировать историю. Числа передавайте JSON-числами, флаги — boolean. Размер пакета <=16 KiB. Дата без часового пояса запрещена. Температура вне −80…+60 °C и RH вне 0…100 отклоняются.

MQTT-мост нормализует snake_case в camelCase и публикует в `firewatch.telemetry.raw` с ключом deviceId. ACK MQTT отправляется после подтверждения Kafka; при сбое мост перезапускается и использует persistent MQTT session. Незарегистрированные, неназначенные или не совпадающие по типу устройства API игнорирует. Пакеты до момента назначения датчика игнорируются, чтобы задержанные сообщения не попадали в другой участок.

## Физическое подключение

HMP155 подключается к аппаратному шлюзу через интерфейс конкретной комплектации, например RS-485. FS24X — через тревожный и fault выходы / промышленный интерфейс комплектации. Реальный драйвер опроса и перевод электрических сигналов в значения JSON зависят от выбранного оборудования; в этом репозитории готов транспортный контракт, а не прошивка аппаратного шлюза.

Публикуйте оба канала регулярно, включая FS24X без пламени, иначе через 120 секунд канал будет считаться устаревшим. fault=true означает неисправный канал; показания такого пакета не используются для оценки. Для HMP155 контракт всё равно требует числовые поля в диапазоне; при недоступном измерении шлюз может использовать последнее валидное значение с fault=true — оно не будет участвовать в fusion.

## Настройка симулятора

`SCENARIO`: normal / drying / fire / offline / fault / mixed.
`INTERVAL_SECONDS`: по умолчанию 5.
`SIMULATOR_STATIONS`, пример:

```json
[
  {"prefix": "forest-a", "scenario": "normal"},
  {"prefix": "forest-b", "scenario": "fire"}
]
```

Зарегистрируйте forest-a-hmp155, forest-a-fs24x, forest-b-hmp155, forest-b-fs24x и назначьте их участкам. При mixed используется сценарий каждой станции; другое SCENARIO переопределяет все станции. offline перестаёт передавать FS24X, fault передаёт fault для FS24X. Все сообщения симулятора имеют simulated=true.

## Ручная публикация

Установив Python и paho-mqtt, можно использовать скрипт ниже. Сначала зарегистрируйте demo-hmp155 в UI.

```python
import json, uuid
from datetime import datetime, timezone
import paho.mqtt.publish as publish
payload = {
    "message_id": str(uuid.uuid4()),
    "device_id": "demo-hmp155",
    "sensor_type": "HMP155",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "fault": False, "simulated": True,
    "metrics": {"temperature_c": 37.5, "humidity_pct": 24.0}
}
publish.single("firewatch/nodes/demo-hmp155/telemetry",
               json.dumps(payload), hostname="localhost", port=1885, qos=1)
```
