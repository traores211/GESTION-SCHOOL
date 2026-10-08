/* Test helper: clears rate-limit counters so a scenario does not depend on the ones run before it
 * (several scenarios create a school through the public sign-up, limited to 5 per hour and address).
 * Without REDIS_URL the API keeps its counters in memory and nothing can be cleared from here.
 */
const Redis = require('ioredis');

async function clearThrottle(pattern = 'throttle:signup*') {
  if (!process.env.REDIS_URL) return 0;
  const Client = Redis.default ?? Redis.Redis ?? Redis;
  const redis = new Client(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
    return keys.length;
  } catch {
    return 0;
  } finally {
    redis.disconnect();
  }
}

module.exports = { clearThrottle };
