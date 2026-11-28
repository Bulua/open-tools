import type { Category } from "../types";
import httpClient from "./http-client";
import ipLookup from "./ip-lookup";
import ping from "./ping";
import mqttClient from "./mqtt-client";

const network: Category = {
  id: "network",
  name: "网络",
  tools: [httpClient, ipLookup, ping, mqttClient],
};

export default network;
