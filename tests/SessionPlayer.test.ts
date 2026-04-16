import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { SessionPlayer } from '../src/main/recording/SessionPlayer'

// Minimal BrowserWindow mock
function mockWindow(): any {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn()
    }
  }
}

function writeTempFile(lines: string[]): string {
  const filePath = path.join(os.tmpdir(), `nmtr-test-${Date.now()}.nmtr`)
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  return filePath
}

describe('SessionPlayer', () => {
  let win: any

  beforeEach(() => {
    win = mockWindow()
  })

  it('throws on empty file (no meta)', async () => {
    const filePath = writeTempFile([''])
    const player = new SessionPlayer('test-1', win)
    await expect(player.load(filePath)).rejects.toThrow('no metadata line found')
    fs.unlinkSync(filePath)
  })

  it('throws on file with only frames (no meta)', async () => {
    const filePath = writeTempFile([
      JSON.stringify({ type: 'frame', t: 0, hops: [] }),
      JSON.stringify({ type: 'frame', t: 500, hops: [] })
    ])
    const player = new SessionPlayer('test-2', win)
    await expect(player.load(filePath)).rejects.toThrow('no metadata line found')
    fs.unlinkSync(filePath)
  })

  it('loads valid file with meta and frames', async () => {
    const filePath = writeTempFile([
      JSON.stringify({ type: 'meta', version: '0.1.0', target: '8.8.8.8', startedAt: 1000, protocol: 'icmp', intervalMs: 500 }),
      JSON.stringify({ type: 'frame', t: 0, hops: [] }),
      JSON.stringify({ type: 'frame', t: 500, hops: [] }),
      JSON.stringify({ type: 'frame', t: 1000, hops: [] })
    ])
    const player = new SessionPlayer('test-3', win)
    const result = await player.load(filePath)
    expect(result.meta.target).toBe('8.8.8.8')
    expect(result.frameCount).toBe(3)
    expect(result.durationMs).toBe(1000)
    fs.unlinkSync(filePath)
  })

  it('skips malformed JSON lines', async () => {
    const filePath = writeTempFile([
      JSON.stringify({ type: 'meta', version: '0.1.0', target: 'x', startedAt: 0, protocol: 'icmp', intervalMs: 500 }),
      'NOT VALID JSON',
      JSON.stringify({ type: 'frame', t: 0, hops: [] }),
      '{broken',
      JSON.stringify({ type: 'frame', t: 100, hops: [] })
    ])
    const player = new SessionPlayer('test-4', win)
    const result = await player.load(filePath)
    expect(result.frameCount).toBe(2)
    fs.unlinkSync(filePath)
  })

  it('seek on empty frames does not crash', async () => {
    const filePath = writeTempFile([
      JSON.stringify({ type: 'meta', version: '0.1.0', target: 'x', startedAt: 0, protocol: 'icmp', intervalMs: 500 })
    ])
    const player = new SessionPlayer('test-5', win)
    await player.load(filePath)
    // Should not throw
    player.seek(0)
    player.seek(1000)
    fs.unlinkSync(filePath)
  })

  it('stop resets frame index', async () => {
    const filePath = writeTempFile([
      JSON.stringify({ type: 'meta', version: '0.1.0', target: 'x', startedAt: 0, protocol: 'icmp', intervalMs: 500 }),
      JSON.stringify({ type: 'frame', t: 0, hops: [] }),
      JSON.stringify({ type: 'frame', t: 500, hops: [] })
    ])
    const player = new SessionPlayer('test-6', win)
    await player.load(filePath)
    player.play(1)
    player.stop()
    // Should not throw or leave timers running
    fs.unlinkSync(filePath)
  })
})
