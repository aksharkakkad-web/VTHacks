/** Keep URL/token pairs together; Vercel Marketplace supplies the KV_* names. */
export function redisConfiguration(env: Record<string, string | undefined> = process.env) {
  const direct = Boolean(env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN);
  const url = direct ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
  const token = direct ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : undefined;
}
