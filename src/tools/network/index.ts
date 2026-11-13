import type { Category } from "../types";
import httpClient from "./http-client";
import ipLookup from "./ip-lookup";
import ping from "./ping";
import headers from "./headers";

const network: Category = {
  id: "network",
  name: "网络",
  tools: [httpClient, ipLookup, ping, headers],
};

export default network;
