/**
 * Minimal metrics in the Prometheus text format, without a dependency: request counts by method and
 * status class, a latency histogram, and process figures. Kept in memory, per API instance.
 */
const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const requests = new Map<string, number>();
const bucketCounts = new Array<number>(BUCKETS.length).fill(0);
let durationSum = 0;
let durationCount = 0;
const startedAt = Date.now();

/** Records one finished HTTP request. */
export function observeRequest(method: string, status: number, durationMs: number) {
  const key = `${method.toUpperCase()}|${Math.floor(status / 100)}xx`;
  requests.set(key, (requests.get(key) ?? 0) + 1);
  const seconds = durationMs / 1000;
  durationSum += seconds;
  durationCount++;
  BUCKETS.forEach((limit, i) => {
    if (seconds <= limit) bucketCounts[i]++;
  });
}

export function resetMetrics() {
  requests.clear();
  bucketCounts.fill(0);
  durationSum = 0;
  durationCount = 0;
}

/** The metrics page scraped by Prometheus. `extra` adds gauges computed by the caller. */
export function renderMetrics(extra: Record<string, { help: string; value: number }> = {}): string {
  const lines: string[] = [];
  lines.push('# HELP http_requests_total HTTP requests handled, by method and status class.', '# TYPE http_requests_total counter');
  for (const [key, count] of [...requests.entries()].sort()) {
    const [method, status] = key.split('|');
    lines.push(`http_requests_total{method="${method}",status="${status}"} ${count}`);
  }
  lines.push('# HELP http_request_duration_seconds Duration of HTTP requests.', '# TYPE http_request_duration_seconds histogram');
  BUCKETS.forEach((limit, i) => lines.push(`http_request_duration_seconds_bucket{le="${limit}"} ${bucketCounts[i]}`));
  lines.push(`http_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`, `http_request_duration_seconds_sum ${durationSum.toFixed(3)}`, `http_request_duration_seconds_count ${durationCount}`);
  const memory = process.memoryUsage();
  const gauges: Record<string, { help: string; value: number }> = {
    process_uptime_seconds: { help: 'Seconds since the API started.', value: Math.round((Date.now() - startedAt) / 1000) },
    process_resident_memory_bytes: { help: 'Resident memory of the API process.', value: memory.rss },
    nodejs_heap_used_bytes: { help: 'Heap used by the API process.', value: memory.heapUsed },
    ...extra,
  };
  for (const [name, gauge] of Object.entries(gauges)) lines.push(`# HELP ${name} ${gauge.help}`, `# TYPE ${name} gauge`, `${name} ${gauge.value}`);
  return `${lines.join('\n')}\n`;
}
