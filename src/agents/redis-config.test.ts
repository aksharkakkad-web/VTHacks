import { test } from "node:test";
import { strict as assert } from "node:assert";
import { redisConfiguration } from "../lib/trip-state/redis-config";

test("Redis configuration accepts Vercel marketplace names and direct Upstash names", () => {
  assert.deepEqual(redisConfiguration({ KV_REST_API_URL: "https://marketplace.example", KV_REST_API_TOKEN: "marketplace-token" }), { url: "https://marketplace.example", token: "marketplace-token" });
  assert.deepEqual(redisConfiguration({ UPSTASH_REDIS_REST_URL: "https://direct.example", UPSTASH_REDIS_REST_TOKEN: "direct-token", KV_REST_API_URL: "https://marketplace.example", KV_REST_API_TOKEN: "marketplace-token" }), { url: "https://direct.example", token: "direct-token" });
});

test("an incomplete explicit Redis configuration never borrows another database's credential", () => {
  assert.equal(redisConfiguration({ UPSTASH_REDIS_REST_URL: "https://direct.example", KV_REST_API_URL: "https://marketplace.example", KV_REST_API_TOKEN: "marketplace-token" }), undefined);
  assert.equal(redisConfiguration({ UPSTASH_REDIS_REST_TOKEN: "direct-token", KV_REST_API_URL: "https://marketplace.example" }), undefined);
  assert.equal(redisConfiguration({}), undefined);
});
