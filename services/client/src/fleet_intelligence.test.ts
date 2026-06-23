import { describe, it, expect } from 'vitest';
import {
  groupByHost,
  ewmaFailure,
  currentFailStreak,
  anomalyScore,
  scoreHost,
  fleetTrend,
  analyzeFleet,
  type ProvisionEvent,
} from './fleet_intelligence';

const DAY = 86400000;

// helper: build an event N days ago
function ev(name: string, success: boolean, daysAgo = 0, error?: string): ProvisionEvent {
  return {
    target_name: name,
    success,
    timestamp: new Date(Date.now() - daysAgo * DAY).toISOString(),
    ...(error ? { error } : {}),
  };
}

describe('groupByHost', () => {
  it('groups and sorts each host oldest → newest', () => {
    const g = groupByHost([ev('a', true, 1), ev('a', false, 3), ev('b', true, 0)]);
    expect([...g.keys()].sort()).toEqual(['a', 'b']);
    const a = g.get('a')!;
    // sorted oldest first → the 3-days-ago event precedes the 1-day-ago one
    expect(a[0].success).toBe(false);
    expect(a[1].success).toBe(true);
  });

  it('ignores records without a target_name', () => {
    const g = groupByHost([{ success: true } as ProvisionEvent, ev('a', true)]);
    expect([...g.keys()]).toEqual(['a']);
  });
});

describe('ewmaFailure', () => {
  it('is 0 for all-success and ~1 for all-failure', () => {
    expect(ewmaFailure([ev('a', true), ev('a', true), ev('a', true)])).toBeCloseTo(0, 5);
    expect(ewmaFailure([ev('a', false), ev('a', false), ev('a', false)])).toBeCloseTo(1, 5);
  });

  it('weights recent events more heavily', () => {
    // recently failing should score higher than recently recovering
    const recentlyBad = ewmaFailure([ev('a', true), ev('a', true), ev('a', false), ev('a', false)]);
    const recentlyGood = ewmaFailure([ev('a', false), ev('a', false), ev('a', true), ev('a', true)]);
    expect(recentlyBad).toBeGreaterThan(recentlyGood);
  });
});

describe('currentFailStreak', () => {
  it('counts consecutive trailing failures', () => {
    expect(currentFailStreak([ev('a', true), ev('a', false), ev('a', false)])).toBe(2);
    expect(currentFailStreak([ev('a', false), ev('a', true)])).toBe(0);
    expect(currentFailStreak([ev('a', false), ev('a', false)])).toBe(2);
  });
});

describe('anomalyScore', () => {
  it('flags a host that was stable then started failing', () => {
    const events = [
      ...Array(8).fill(0).map(() => ev('a', true)),
      ...Array(5).fill(0).map(() => ev('a', false)),
    ];
    expect(anomalyScore(events)).toBeGreaterThan(2);
  });

  it('is ~0 for consistent behaviour', () => {
    const events = Array(12).fill(0).map(() => ev('a', true));
    expect(anomalyScore(events)).toBe(0);
  });
});

describe('scoreHost', () => {
  it('scores a chronically failing host as critical', () => {
    const events = Array(10).fill(0).map((_, i) => ev('bad', false, 10 - i));
    const r = scoreHost('bad', events);
    expect(r.band).toBe('critical');
    expect(r.risk).toBeGreaterThan(66);
    expect(r.currentStreak).toBe(10);
  });

  it('scores a healthy host as stable', () => {
    const events = Array(10).fill(0).map((_, i) => ev('good', true, 10 - i));
    const r = scoreHost('good', events);
    expect(r.band).toBe('stable');
    expect(r.risk).toBeLessThan(33);
  });

  it('surfaces the most common error', () => {
    const events = [
      ev('a', false, 3, 'timeout'),
      ev('a', false, 2, 'timeout'),
      ev('a', false, 1, 'dns'),
    ];
    expect(scoreHost('a', events).topError).toBe('timeout');
  });

  it('treats a host with no events as unknown, not safe', () => {
    const r = scoreHost('empty', []);
    expect(r.risk).toBeGreaterThan(0);
    expect(r.total).toBe(0);
  });
});

describe('fleetTrend', () => {
  it('detects a declining fleet', () => {
    const events: ProvisionEvent[] = [];
    // older days mostly success, recent days mostly failure
    for (let d = 6; d >= 0; d--) {
      const failing = d <= 2;
      for (let i = 0; i < 4; i++) events.push(ev('h', !failing, d));
    }
    const t = fleetTrend(events);
    expect(t.direction).toBe('declining');
    expect(t.slopePerDay).toBeLessThan(0);
    expect(t.series.length).toBeGreaterThan(1);
  });

  it('handles empty input', () => {
    const t = fleetTrend([]);
    expect(t.series).toEqual([]);
    expect(t.direction).toBe('flat');
  });
});

describe('analyzeFleet', () => {
  it('produces a ranked report with insights', () => {
    const events = [
      ...Array(6).fill(0).map((_, i) => ev('riskyhost', false, 6 - i)),
      ...Array(6).fill(0).map((_, i) => ev('safehost', true, 6 - i)),
    ];
    const report = analyzeFleet(events);
    expect(report.hosts[0].name).toBe('riskyhost'); // highest risk first
    expect(report.hosts[0].risk).toBeGreaterThan(report.hosts[1].risk);
    expect(report.insights.length).toBeGreaterThan(0);
    expect(report.insights.some(i => i.severity === 'critical')).toBe(true);
  });

  it('reports a stable fleet cleanly', () => {
    const events = Array(10).fill(0).map((_, i) => ev('h', true, 10 - i));
    const report = analyzeFleet(events);
    expect(report.insights.some(i => i.severity === 'good')).toBe(true);
  });
});
