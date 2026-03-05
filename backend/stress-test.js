#!/usr/bin/env node
/**
 * Slawk Backend Latency & Stress Test
 * Tests all major endpoints for response time and throughput at 100 req/s
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function getToken() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@slawk.dev', password: 'password123' }),
  });
  const data = await res.json();
  return data.token;
}

// ─── Latency analysis: measure p50, p95, p99, avg for each endpoint ───

async function measureEndpoint(name, url, options, token, iterations = 50) {
  const headers = { Authorization: `Bearer ${token}`, ...options?.headers };
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const res = await fetch(url, { ...options, headers });
      await res.text(); // consume body
      const elapsed = performance.now() - start;
      times.push({ elapsed, status: res.status });
    } catch (e) {
      times.push({ elapsed: performance.now() - start, status: 0, error: e.message });
    }
  }

  const successful = times.filter((t) => t.status >= 200 && t.status < 400);
  const durations = successful.map((t) => t.elapsed).sort((a, b) => a - b);

  if (durations.length === 0) {
    return { name, error: 'All requests failed', failures: times.length };
  }

  const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];
  const min = durations[0];
  const max = durations[durations.length - 1];

  return {
    name,
    avg: avg.toFixed(1),
    p50: p50.toFixed(1),
    p95: p95.toFixed(1),
    p99: p99.toFixed(1),
    min: min.toFixed(1),
    max: max.toFixed(1),
    failures: times.length - successful.length,
    count: durations.length,
  };
}

// ─── Stress test: sustained 100 req/s for 10 seconds ───

async function stressTest(name, url, options, token, rps = 100, durationSec = 10) {
  const headers = { Authorization: `Bearer ${token}`, ...options?.headers };
  const totalRequests = rps * durationSec;
  const intervalMs = 1000 / rps;

  const results = [];
  const startTime = performance.now();

  const promises = [];
  for (let i = 0; i < totalRequests; i++) {
    const scheduledAt = i * intervalMs;
    const p = new Promise((resolve) => {
      setTimeout(async () => {
        const reqStart = performance.now();
        try {
          const res = await fetch(url, { ...options, headers });
          await res.text();
          resolve({
            elapsed: performance.now() - reqStart,
            status: res.status,
          });
        } catch (e) {
          resolve({
            elapsed: performance.now() - reqStart,
            status: 0,
            error: e.message,
          });
        }
      }, scheduledAt);
    });
    promises.push(p);
  }

  const allResults = await Promise.all(promises);
  const wallTime = performance.now() - startTime;

  const successful = allResults.filter((r) => r.status >= 200 && r.status < 400);
  const durations = successful.map((r) => r.elapsed).sort((a, b) => a - b);
  const errors = allResults.filter((r) => r.status === 0 || r.status >= 400);

  const avg = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;
  const p50 = durations.length ? durations[Math.floor(durations.length * 0.5)] : 0;
  const p95 = durations.length ? durations[Math.floor(durations.length * 0.95)] : 0;
  const p99 = durations.length ? durations[Math.floor(durations.length * 0.99)] : 0;

  return {
    name,
    totalRequests,
    successful: successful.length,
    failed: errors.length,
    wallTimeSec: (wallTime / 1000).toFixed(2),
    actualRps: (successful.length / (wallTime / 1000)).toFixed(1),
    avgMs: avg.toFixed(1),
    p50Ms: p50.toFixed(1),
    p95Ms: p95.toFixed(1),
    p99Ms: p99.toFixed(1),
    errorRate: ((errors.length / totalRequests) * 100).toFixed(1) + '%',
    errorStatuses: [...new Set(errors.map((e) => e.status || e.error))],
  };
}

// ─── Main ───

async function main() {
  console.log('='.repeat(80));
  console.log('  SLAWK BACKEND LATENCY & STRESS TEST');
  console.log('='.repeat(80));

  const token = await getToken();
  if (!token) {
    console.error('Failed to get token');
    process.exit(1);
  }

  // First, get dynamic IDs for testing
  const channelsRes = await fetch(`${BASE_URL}/channels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const channels = await channelsRes.json();
  const channelId = channels[0]?.id;

  const messagesRes = await fetch(`${BASE_URL}/channels/${channelId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const messagesData = await messagesRes.json();
  // Messages might be an array or have a messages key
  const messages = Array.isArray(messagesData) ? messagesData : messagesData.messages || [];
  const messageId = messages[0]?.id;
  console.log(`  First message sample:`, JSON.stringify(messages[0])?.slice(0, 100));

  const usersRes = await fetch(`${BASE_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const users = await usersRes.json();

  const dmsRes = await fetch(`${BASE_URL}/dms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dms = await dmsRes.json();
  const dmUserId = dms[0]?.otherUser?.id || users[1]?.id;

  console.log(`\nTest data: channel=${channelId}, message=${messageId}, dmUser=${dmUserId}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Individual endpoint latency (50 sequential requests each)
  // ═══════════════════════════════════════════════════════════════════
  console.log('─'.repeat(80));
  console.log('  PHASE 1: ENDPOINT LATENCY ANALYSIS (50 requests each, sequential)');
  console.log('─'.repeat(80));

  const endpoints = [
    // Auth
    ['POST /auth/login', `${BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'alice@slawk.dev', password: 'password123' }) }],

    // Users
    ['GET /users/me', `${BASE_URL}/users/me`, {}],
    ['GET /users', `${BASE_URL}/users`, {}],
    ['GET /users/:id', `${BASE_URL}/users/${users[1]?.id}`, {}],
    ['GET /users/:id/presence', `${BASE_URL}/users/${users[1]?.id}/presence`, {}],

    // Channels
    ['GET /channels', `${BASE_URL}/channels`, {}],
    ['GET /channels/:id', `${BASE_URL}/channels/${channelId}`, {}],
    ['GET /channels/:id/members', `${BASE_URL}/channels/${channelId}/members`, {}],
    ['GET /channels/:id/messages', `${BASE_URL}/channels/${channelId}/messages`, {}],
    ['GET /channels/:id/files', `${BASE_URL}/channels/${channelId}/files`, {}],
    ['GET /channels/:id/pins', `${BASE_URL}/channels/${channelId}/pins`, {}],

    // Messages
    ['GET /messages/:id/thread', `${BASE_URL}/messages/${messageId}/thread`, {}],
    ['GET /messages/:id/reactions', `${BASE_URL}/messages/${messageId}/reactions`, {}],

    // DMs
    ['GET /dms', `${BASE_URL}/dms`, {}],
    ['GET /dms/:userId', `${BASE_URL}/dms/${dmUserId}`, {}],

    // Search
    ['GET /search?q=cache', `${BASE_URL}/search?q=cache`, {}],
    ['GET /search?q=test&type=messages', `${BASE_URL}/search?q=test&type=messages`, {}],

    // Bookmarks
    ['GET /bookmarks', `${BASE_URL}/bookmarks`, {}],

    // Scheduled
    ['GET /messages/scheduled', `${BASE_URL}/messages/scheduled`, {}],

    // Health
    ['GET /health', `${BASE_URL}/health`, {}],
  ];

  const results = [];
  for (const [name, url, opts] of endpoints) {
    process.stdout.write(`  Testing ${name}...`);
    const result = await measureEndpoint(name, url, opts, token, 50);
    results.push(result);
    if (result.error) {
      console.log(` ERROR: ${result.error}`);
    } else {
      console.log(` avg=${result.avg}ms p95=${result.p95}ms`);
    }
  }

  // Sort by avg latency descending
  results.sort((a, b) => parseFloat(b.avg || 0) - parseFloat(a.avg || 0));

  console.log('\n' + '─'.repeat(80));
  console.log('  LATENCY RESULTS (sorted by avg, slowest first)');
  console.log('─'.repeat(80));
  console.log(
    '  ' +
      'Endpoint'.padEnd(40) +
      'Avg'.padStart(8) +
      'P50'.padStart(8) +
      'P95'.padStart(8) +
      'P99'.padStart(8) +
      'Max'.padStart(8) +
      'Fail'.padStart(6)
  );
  console.log('  ' + '─'.repeat(76));

  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.name.padEnd(40)} ERROR: ${r.error}`);
    } else {
      const flag = parseFloat(r.avg) > 50 ? ' ⚠️ SLOW' : parseFloat(r.avg) > 20 ? ' ⚡' : '';
      console.log(
        '  ' +
          r.name.padEnd(40) +
          `${r.avg}ms`.padStart(8) +
          `${r.p50}ms`.padStart(8) +
          `${r.p95}ms`.padStart(8) +
          `${r.p99}ms`.padStart(8) +
          `${r.max}ms`.padStart(8) +
          `${r.failures}`.padStart(6) +
          flag
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: Stress test at 100 req/s for 10 seconds
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n' + '─'.repeat(80));
  console.log('  PHASE 2: STRESS TEST (100 req/s for 10 seconds)');
  console.log('─'.repeat(80));

  const stressEndpoints = [
    ['GET /health', `${BASE_URL}/health`, {}],
    ['GET /users/me', `${BASE_URL}/users/me`, {}],
    ['GET /channels', `${BASE_URL}/channels`, {}],
    ['GET /channels/:id/messages', `${BASE_URL}/channels/${channelId}/messages`, {}],
    ['GET /dms', `${BASE_URL}/dms`, {}],
    ['GET /search?q=cache', `${BASE_URL}/search?q=cache`, {}],
    ['POST /auth/login', `${BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'alice@slawk.dev', password: 'password123' }) }],
  ];

  const stressResults = [];
  for (const [name, url, opts] of stressEndpoints) {
    console.log(`\n  Stress testing: ${name} (100 req/s x 10s = 1000 total)...`);
    const result = await stressTest(name, url, opts, token, 100, 10);
    stressResults.push(result);
    console.log(
      `    ✓ ${result.successful}/${result.totalRequests} OK | ` +
      `RPS: ${result.actualRps} | ` +
      `Avg: ${result.avgMs}ms | P95: ${result.p95Ms}ms | P99: ${result.p99Ms}ms | ` +
      `Errors: ${result.errorRate}`
    );
    if (result.errorStatuses.length > 0) {
      console.log(`    Error types: ${result.errorStatuses.join(', ')}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(80));
  console.log('  SUMMARY & RECOMMENDATIONS');
  console.log('='.repeat(80));

  // Find slow endpoints (>50ms avg)
  const slowEndpoints = results.filter((r) => !r.error && parseFloat(r.avg) > 50);
  const mediumEndpoints = results.filter((r) => !r.error && parseFloat(r.avg) > 20 && parseFloat(r.avg) <= 50);

  if (slowEndpoints.length > 0) {
    console.log('\n  🔴 SLOW ENDPOINTS (avg > 50ms) — needs optimization:');
    for (const r of slowEndpoints) {
      console.log(`    - ${r.name}: avg=${r.avg}ms, p95=${r.p95}ms`);
    }
  }

  if (mediumEndpoints.length > 0) {
    console.log('\n  🟡 MODERATE ENDPOINTS (avg 20-50ms) — consider optimizing:');
    for (const r of mediumEndpoints) {
      console.log(`    - ${r.name}: avg=${r.avg}ms, p95=${r.p95}ms`);
    }
  }

  const fastEndpoints = results.filter((r) => !r.error && parseFloat(r.avg) <= 20);
  if (fastEndpoints.length > 0) {
    console.log(`\n  🟢 FAST ENDPOINTS (avg ≤ 20ms): ${fastEndpoints.length} endpoints`);
  }

  // Stress test summary
  const failedStress = stressResults.filter((r) => parseFloat(r.errorRate) > 1);
  if (failedStress.length > 0) {
    console.log('\n  🔴 STRESS TEST FAILURES (>1% error rate):');
    for (const r of failedStress) {
      console.log(`    - ${r.name}: ${r.errorRate} errors, actual RPS=${r.actualRps}`);
    }
  }

  const degradedStress = stressResults.filter((r) => parseFloat(r.p95Ms) > 100);
  if (degradedStress.length > 0) {
    console.log('\n  🟡 STRESS TEST DEGRADATION (p95 > 100ms under load):');
    for (const r of degradedStress) {
      console.log(`    - ${r.name}: p95=${r.p95Ms}ms under 100 req/s`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
