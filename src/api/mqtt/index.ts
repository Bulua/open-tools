/**
 * MQTT 客户端后端 API 定义（统一经由 `requestBackend`、`requestBackendStream` 与 `unwrapApiResponse` 处理通信）。
 */
import { requestBackend, requestBackendStream, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { ConnectionConfig, MqttNotice, MqttWorkspace, QoS } from "@/types/mqtt";

export const mqttApi = {
  async connect(
    id: string,
    config: ConnectionConfig,
    onNotice: (notice: MqttNotice) => void,
  ): Promise<void> {
    const res = await requestBackendStream<ApiResponsePayload<null>, MqttNotice>(
      "mqtt_connect",
      { id, config },
      onNotice,
      "events",
    );
    unwrapApiResponse(res);
  },

  async disconnect(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("mqtt_disconnect", { id });
    unwrapApiResponse(res);
  },

  async subscribe(id: string, topic: string, qos: QoS): Promise<QoS | null> {
    const res = await requestBackend<ApiResponsePayload<QoS | null>>("mqtt_subscribe", {
      id,
      topic,
      qos,
    });
    return unwrapApiResponse(res);
  },

  async unsubscribe(id: string, topic: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("mqtt_unsubscribe", {
      id,
      topic,
    });
    unwrapApiResponse(res);
  },

  async publish(
    id: string,
    topic: string,
    payload: number[],
    qos: QoS,
    retain: boolean,
  ): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("mqtt_publish", {
      id,
      topic,
      payload,
      qos,
      retain,
    });
    unwrapApiResponse(res);
  },

  async loadWorkspace(): Promise<MqttWorkspace | null> {
    const res = await requestBackend<ApiResponsePayload<MqttWorkspace | null>>(
      "mqtt_workspace_load",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: null }) },
    );
    return unwrapApiResponse(res);
  },

  async saveWorkspace(workspace: MqttWorkspace): Promise<MqttWorkspace> {
    const res = await requestBackend<ApiResponsePayload<MqttWorkspace>>("mqtt_workspace_save", {
      workspace,
    });
    return unwrapApiResponse(res);
  },
};
