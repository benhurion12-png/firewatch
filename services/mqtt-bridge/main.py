import json
import os
import time
from confluent_kafka import Producer
import paho.mqtt.client as mqtt
from processor import normalize

producer = Producer({"bootstrap.servers": os.getenv("KAFKA_BROKER", "localhost:9094"),
                     "enable.idempotence": True, "message.timeout.ms": 15000})

def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        client.subscribe("firewatch/nodes/+/telemetry", qos=1)
        print("MQTT bridge connected", flush=True)

def on_message(client, userdata, msg):
    try:
        value = normalize(msg.topic, msg.payload)
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        print("Rejected packet:", str(exc), flush=True)
        client.ack(msg.mid, msg.qos)
        return
    errors = []
    def delivered(error, message):
        if error:
            errors.append(str(error))
    producer.produce("firewatch.telemetry.raw", key=value["deviceId"],
                     value=json.dumps(value), on_delivery=delivered)
    remaining = producer.flush(20)
    if remaining or errors:
        # Process restart reconnects the persistent MQTT session; no ACK means retry.
        raise RuntimeError("Kafka delivery failed: " + str(errors))
    client.ack(msg.mid, msg.qos)

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="firewatch-bridge",
                     clean_session=False, manual_ack=True)
if os.getenv("MQTT_USERNAME"):
    client.username_pw_set(os.environ["MQTT_USERNAME"], os.getenv("MQTT_PASSWORD"))
client.on_connect = on_connect
client.on_message = on_message
while True:
    try:
        client.connect(os.getenv("MQTT_HOST", "localhost"), int(os.getenv("MQTT_PORT", "1885")), 60)
        break
    except OSError as exc:
        print("Waiting for MQTT:", exc, flush=True)
        time.sleep(3)
client.loop_forever(retry_first_connection=True)
