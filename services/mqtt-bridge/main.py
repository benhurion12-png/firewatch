import json
import os
import time
from confluent_kafka import Producer
import paho.mqtt.client as mqtt
from processor import normalize

producer = Producer({"bootstrap.servers": os.getenv("KAFKA_BROKER", "localhost:9094"),
                     "enable.idempotence": True, "message.timeout.ms": 15000,
                     "linger.ms": 20})

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

    # The MQTT ACK is sent only after Kafka confirmed the write. Delivery reports are served
    # by producer.poll() in the main loop, so many packets are batched instead of flushed one by one.
    def delivered(error, message, mid=msg.mid, qos=msg.qos):
        if error:
            # Without an ACK the broker redelivers after the restart of this process.
            print("Kafka delivery failed, restarting:", str(error), flush=True)
            os._exit(1)
        client.ack(mid, qos)

    while True:
        try:
            producer.produce("firewatch.telemetry.raw", key=value["deviceId"],
                             value=json.dumps(value), on_delivery=delivered)
            break
        except BufferError:
            producer.poll(0.1)

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
client.loop_start()
try:
    while True:
        producer.poll(0.05)
finally:
    client.loop_stop()
    producer.flush(10)
