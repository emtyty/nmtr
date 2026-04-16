import { describe, it, expect, beforeEach } from 'vitest'
import { StatsAggregator } from '../src/main/prober/StatsAggregator'

describe('StatsAggregator', () => {
  let agg: StatsAggregator

  beforeEach(() => {
    agg = new StatsAggregator(1)
  })

  it('starts with zeroed stats', () => {
    const snap = agg.snapshot()
    expect(snap.hopIndex).toBe(1)
    expect(snap.sent).toBe(0)
    expect(snap.recv).toBe(0)
    expect(snap.loss).toBe(0)
    expect(snap.avg).toBeNull()
    expect(snap.best).toBeNull()
    expect(snap.worst).toBeNull()
    expect(snap.last).toBeNull()
    expect(snap.jitter).toBeNull()
    expect(snap.ip).toBeNull()
    expect(snap.hostname).toBeNull()
  })

  it('records RTT samples correctly', () => {
    agg.record(10)
    agg.record(20)
    agg.record(30)

    const snap = agg.snapshot()
    expect(snap.sent).toBe(3)
    expect(snap.recv).toBe(3)
    expect(snap.loss).toBe(0)
    expect(snap.best).toBe(10)
    expect(snap.worst).toBe(30)
    expect(snap.last).toBe(30)
    expect(snap.avg).toBe(20)
  })

  it('calculates loss percentage', () => {
    agg.record(10)
    agg.recordLoss()
    agg.record(20)
    agg.recordLoss()

    const snap = agg.snapshot()
    expect(snap.sent).toBe(4)
    expect(snap.recv).toBe(2)
    expect(snap.loss).toBe(50)
  })

  it('100% loss when all packets lost', () => {
    agg.recordLoss()
    agg.recordLoss()
    agg.recordLoss()

    const snap = agg.snapshot()
    expect(snap.sent).toBe(3)
    expect(snap.recv).toBe(0)
    expect(snap.loss).toBe(100)
    expect(snap.avg).toBeNull()
    expect(snap.best).toBeNull()
  })

  it('computes jitter via RFC 3550', () => {
    agg.record(10)
    agg.record(20) // |20-10|=10 → jitter=10
    agg.record(20) // |20-20|=0  → jitter += (0-10)/16 = 9.375

    const snap = agg.snapshot()
    expect(snap.jitter).not.toBeNull()
    expect(snap.jitter!).toBeGreaterThan(0)
    expect(snap.jitter!).toBeLessThan(10)
  })

  it('no jitter after single sample', () => {
    agg.record(10)
    expect(agg.snapshot().jitter).toBeNull()
  })

  it('sets IP and hostname', () => {
    agg.setIP('1.2.3.4')
    agg.setHostname('router.example.com')

    const snap = agg.snapshot()
    expect(snap.ip).toBe('1.2.3.4')
    expect(snap.hostname).toBe('router.example.com')
  })

  it('resets all stats', () => {
    agg.record(10)
    agg.record(20)
    agg.recordLoss()
    agg.reset()

    const snap = agg.snapshot()
    expect(snap.sent).toBe(0)
    expect(snap.recv).toBe(0)
    expect(snap.loss).toBe(0)
    expect(snap.avg).toBeNull()
    expect(snap.best).toBeNull()
    expect(snap.jitter).toBeNull()
  })

  it('sparkline has 60 slots', () => {
    const snap = agg.snapshot()
    expect(snap.sparkline).toHaveLength(60)
    expect(snap.sparkline.every((v) => v === null)).toBe(true)
  })

  it('sparkline records values in order', () => {
    agg.record(5)
    agg.record(10)
    agg.recordLoss()
    agg.record(15)

    const spark = agg.snapshot().sparkline
    // Last 4 values should be: 5, 10, null, 15 (preceded by nulls)
    const nonNull = spark.filter((v) => v !== null)
    expect(nonNull).toEqual([5, 10, 15])
  })

  it('sparkline wraps around at 60 samples', () => {
    for (let i = 1; i <= 65; i++) {
      agg.record(i)
    }
    const spark = agg.snapshot().sparkline
    // Should contain the last 60 values: 6..65
    expect(spark[0]).toBe(6)
    expect(spark[59]).toBe(65)
    expect(spark.every((v) => v !== null)).toBe(true)
  })

  it('best/worst survive across many samples', () => {
    agg.record(50)
    agg.record(1)
    agg.record(100)
    agg.record(25)

    const snap = agg.snapshot()
    expect(snap.best).toBe(1)
    expect(snap.worst).toBe(100)
  })
})
