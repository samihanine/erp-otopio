import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const QUEUE = "erp";
export const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
connection.on("error", (e) => console.warn("[redis]", e.message));

export const queue = new Queue(QUEUE, { connection });
export const queueEvents = new QueueEvents(QUEUE, { connection: connection.duplicate() });

export async function redisOk() {
  try {
    return (await connection.ping()) === "PONG";
  } catch {
    return false;
  }
}
