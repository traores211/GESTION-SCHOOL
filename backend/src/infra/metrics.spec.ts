import { observeRequest, renderMetrics, resetMetrics } from './metrics';

describe('metrics', () => {
  beforeEach(() => resetMetrics());

  it('counts requests by method and status class', () => {
    observeRequest('get', 200, 20);
    observeRequest('GET', 204, 30);
    observeRequest('POST', 500, 1200);
    const text = renderMetrics();
    expect(text).toContain('http_requests_total{method="GET",status="2xx"} 2');
    expect(text).toContain('http_requests_total{method="POST",status="5xx"} 1');
  });

  it('builds a cumulative latency histogram', () => {
    observeRequest('GET', 200, 40); // 0.04 s
    observeRequest('GET', 200, 300); // 0.3 s
    observeRequest('GET', 200, 20000); // 20 s: only in +Inf
    const text = renderMetrics();
    expect(text).toContain('http_request_duration_seconds_bucket{le="0.05"} 1');
    expect(text).toContain('http_request_duration_seconds_bucket{le="0.5"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{le="10"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{le="+Inf"} 3');
    expect(text).toContain('http_request_duration_seconds_count 3');
    expect(text).toContain('http_request_duration_seconds_sum 20.340');
  });

  it('exposes process figures and the gauges of the caller in the Prometheus format', () => {
    const text = renderMetrics({ school_erp_database_up: { help: 'Database reachable.', value: 1 } });
    expect(text).toMatch(/# TYPE process_uptime_seconds gauge\nprocess_uptime_seconds \d+/);
    expect(text).toContain('# HELP school_erp_database_up Database reachable.\n# TYPE school_erp_database_up gauge\nschool_erp_database_up 1');
    expect(text.endsWith('\n')).toBe(true);
  });
});
