import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { recordToolUsage } from "@/composables/toolLibrary";
import { showError } from "@/utils/errorToast";
import { createConnectionConfig, appendMessage, decodePayload, type ConnectionStatus, type Message, type MqttNotice, type QoS } from "./mqtt";

export function useMqtt() {
  const config = reactive(createConnectionConfig());
  const status = ref<ConnectionStatus>("disconnected");
  const connected = computed(() => status.value === "connected");
  const subscriptions = ref<{ topic: string; qos: QoS }[]>([]);
  // 预设主题与服务器确认的活动订阅分开；断线后仍可复用预设。
  const topics = ref<{ topic: string; qos: QoS }[]>([]);
  const messages = ref<Message[]>([]);
  const busy = ref(false);
  const supported = isTauri();
  let sessionId = "";
  let sequence = 0;
  let disposed = false;
  let wanted = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let outageReported = false;
  const clearReconnect = () => { clearTimeout(reconnectTimer); reconnectTimer = undefined; };
  const reportError = (error: unknown) => { if (!outageReported) { outageReported = true; showError(error); } };
  const scheduleReconnect = () => {
    clearReconnect();
    if (disposed || !wanted || !config.autoReconnect) return;
    status.value = "reconnecting";
    reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void openConnection(); }, config.reconnectPeriod);
  };
  const addMessage = (message: Omit<Message, "id" | "time">) => {
    messages.value = appendMessage(messages.value, { ...message, id: ++sequence, time: Date.now() });
  };
  // 手动订阅和重连恢复共用确认路径，避免状态校验与 QoS 处理逐渐分叉。
  const confirmSubscription = async (id: string, topic: string, qos: QoS) => {
    const granted = await invoke<QoS>("mqtt_subscribe", { id, topic, qos });
    if (disposed || sessionId !== id || !connected.value) return false;
    subscriptions.value = [...subscriptions.value.filter(item => item.topic !== topic), { topic, qos: granted }];
    return true;
  };
  const openConnection = async () => {
    if (disposed || !wanted) return;
    const id = crypto.randomUUID();
    sessionId = id;
    busy.value = false;
    status.value = "connecting";
    subscriptions.value = [];
    const events = new Channel<MqttNotice>();
    events.onmessage = event => {
      if (disposed || sessionId !== id) return;
      if (event.kind === "message") {
        addMessage({ direction: "received", topic: event.topic, ...decodePayload(event.payload), bytes: event.payload.length, qos: event.qos, retain: event.retain });
      } else {
        sessionId = "";
        status.value = "disconnected";
        busy.value = false;
        subscriptions.value = [];
        if (event.error) reportError(event.error);
        scheduleReconnect();
      }
    };
    try {
      await invoke("mqtt_connect", { id, config: { ...config, host: config.host.trim() }, events });
      if (disposed || sessionId !== id) { await invoke("mqtt_disconnect", { id }); return; }
      // 连接命令返回前也可能已收到网络断开事件。
      if (status.value === "connecting") {
        status.value = "connected";
        outageReported = false;
        recordToolUsage();
        busy.value = true;
        try {
          for (const item of [...topics.value]) {
            if (disposed || sessionId !== id || !connected.value) break;
            try {
              await confirmSubscription(id, item.topic, item.qos);
            } catch (error) { if (!disposed && sessionId === id) showError(error); }
          }
        } finally { if (sessionId === id) busy.value = false; }
      }
    } catch (error) {
      if (disposed || sessionId !== id) return;
      sessionId = "";
      status.value = "disconnected";
      reportError(error);
      scheduleReconnect();
    }
  };
  const connect = async () => {
    if (!supported || status.value !== "disconnected") return;
    wanted = true; outageReported = false;
    await openConnection();
  };
  const disconnect = async () => {
    wanted = false; clearReconnect();
    if (status.value === "disconnecting") return;
    const id = sessionId;
    sessionId = "";
    busy.value = false;
    subscriptions.value = [];
    if (!id) { status.value = "disconnected"; return; }
    status.value = "disconnecting";
    try { await invoke("mqtt_disconnect", { id }); }
    catch (error) { if (!disposed) showError(error); }
    finally { if (!disposed) status.value = "disconnected"; }
  };
  const operate = async (action: (id: string) => Promise<void>) => {
    if (!connected.value || busy.value) return false;
    busy.value = true;
    const id = sessionId;
    try {
      await action(id);
      return !disposed && sessionId === id && connected.value;
    } catch (error) {
      if (!disposed && sessionId === id) showError(error);
      return false;
    }
    finally { if (sessionId === id) busy.value = false; }
  };
  const subscribe = (topic: string, qos: QoS) => operate(async id => {
    if (!await confirmSubscription(id, topic, qos)) return;
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
    disposed = true; wanted = false; clearReconnect();
    if (sessionId) void invoke("mqtt_disconnect", { id: sessionId }).catch(showError);
  });
  return { config, status, connected, subscriptions, topics, messages, busy, supported, connect, disconnect, subscribe, unsubscribe, publish };
}
