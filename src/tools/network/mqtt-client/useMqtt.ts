import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { recordToolUsage } from "@/composables/toolLibrary";
import { showError } from "@/utils/errorToast";
import { appendMessage, decodePayload, type ConnectionConfig, type Message, type MqttNotice, type QoS } from "./mqtt";

export function useMqtt() {
  const config = reactive<ConnectionConfig>({ host: "127.0.0.1", port: 1883, clientId: `open-tools-${crypto.randomUUID().slice(0, 8)}`, username: "", password: "", keepAlive: 60, cleanSession: true, tls: false });
  const status = ref<"disconnected" | "connecting" | "connected" | "disconnecting">("disconnected");
  const connected = computed(() => status.value === "connected");
  const subscriptions = ref<{ topic: string; qos: QoS }[]>([]);
  // 预设主题与服务器确认的活动订阅分开；断线后仍可复用预设。
  const topics = ref<{ topic: string; qos: QoS }[]>([]);
  const messages = ref<Message[]>([]);
  const busy = ref(false);
  const lastError = ref("");
  const supported = isTauri();
  let sessionId = "";
  let sequence = 0;
  let disposed = false;
  const addMessage = (message: Omit<Message, "id" | "time">) => {
    messages.value = appendMessage(messages.value, { ...message, id: ++sequence, time: Date.now() });
  };
  const connect = async () => {
    if (!supported || status.value !== "disconnected") return;
    const id = crypto.randomUUID();
    sessionId = id;
    busy.value = false;
    status.value = "connecting";
    lastError.value = "";
    subscriptions.value = [];
    const events = new Channel<MqttNotice>();
    events.onmessage = event => {
      if (disposed || sessionId !== id) return;
      if (event.kind === "message") {
        addMessage({ direction: "received", topic: event.topic, ...decodePayload(event.payload), bytes: event.payload.length, qos: event.qos, retain: event.retain });
      } else {
        status.value = "disconnected";
        busy.value = false;
        subscriptions.value = [];
        if (event.error) { lastError.value = event.error; showError(event.error); }
      }
    };
    try {
      await invoke("mqtt_connect", { id, config: { ...config, host: config.host.trim() }, events });
      if (disposed || sessionId !== id) { await invoke("mqtt_disconnect", { id }); return; }
      // 连接命令返回前也可能已收到网络断开事件。
      if (status.value === "connecting") {
        status.value = "connected";
        recordToolUsage();
        busy.value = true;
        try {
          for (const item of [...topics.value]) {
            if (disposed || sessionId !== id || !connected.value) break;
            try {
              const granted = await invoke<QoS>("mqtt_subscribe", { id, topic: item.topic, qos: item.qos });
              if (!disposed && sessionId === id && connected.value) subscriptions.value.push({ topic: item.topic, qos: granted });
            } catch (error) { if (!disposed && sessionId === id) showError(error); }
          }
        } finally { if (sessionId === id) busy.value = false; }
      }
    } catch (error) {
      if (disposed || sessionId !== id) return;
      status.value = "disconnected";
      lastError.value = String(error);
      showError(error);
    }
  };
  const disconnect = async () => {
    if (!sessionId || status.value === "disconnecting") return;
    const id = sessionId;
    status.value = "disconnecting";
    try {
      await invoke("mqtt_disconnect", { id });
      if (sessionId === id) {
        sessionId = "";
        busy.value = false;
        status.value = "disconnected";
        subscriptions.value = [];
      }
    } catch (error) { showError(error); if (sessionId === id) status.value = "disconnected"; }
  };
  const operate = async (action: (id: string) => Promise<void>) => {
    if (!connected.value || busy.value) return;
    busy.value = true;
    const id = sessionId;
    try { await action(id); } catch (error) { if (!disposed && sessionId === id) showError(error); }
    finally { if (sessionId === id) busy.value = false; }
  };
  const subscribe = (topic: string, qos: QoS) => operate(async id => {
    const granted = await invoke<QoS>("mqtt_subscribe", { id, topic, qos });
    if (sessionId !== id || !connected.value || disposed) return;
    subscriptions.value = [...subscriptions.value.filter(s => s.topic !== topic), { topic, qos: granted }];
    topics.value = [...topics.value.filter(s => s.topic !== topic), { topic, qos }];
  });
  const unsubscribe = (topic: string) => operate(async id => {
    await invoke("mqtt_unsubscribe", { id, topic });
    if (sessionId === id) {
      subscriptions.value = subscriptions.value.filter(s => s.topic !== topic);
      topics.value = topics.value.filter(s => s.topic !== topic);
    }
  });
  const publish = (topic: string, payload: string, qos: QoS, retain: boolean) => operate(async id => {
    const bytes = Array.from(new TextEncoder().encode(payload));
    await invoke("mqtt_publish", { id, topic, payload: bytes, qos, retain });
    if (disposed || sessionId !== id) return;
    addMessage({ direction: "sent", topic, payload, bytes: bytes.length, qos, retain, binary: false });
    recordToolUsage();
  });
  onBeforeUnmount(() => {
    disposed = true;
    if (sessionId) void invoke("mqtt_disconnect", { id: sessionId }).catch(showError);
  });
  return { config, status, connected, subscriptions, topics, messages, busy, supported, lastError, connect, disconnect, subscribe, unsubscribe, publish };
}
