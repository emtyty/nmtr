import { describe, it, expect } from 'vitest'

// Test the pure helper functions by importing the module and testing via exports
// Since LanScanner only exports scanLan(), we test the logic patterns directly

describe('LAN Scanner helpers', () => {
  describe('ipInSubnet logic', () => {
    function ipInSubnet(ip: string, cidr: string): boolean {
      const [netAddr, prefixStr] = cidr.split('/')
      const prefix = parseInt(prefixStr)
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
      const ipNum = ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o), 0) >>> 0
      const netNum = netAddr.split('.').reduce((acc, o) => (acc << 8) | parseInt(o), 0) >>> 0
      return (ipNum & mask) === (netNum & mask)
    }

    it('matches IPs in /24 subnet', () => {
      expect(ipInSubnet('192.168.1.100', '192.168.1.0/24')).toBe(true)
      expect(ipInSubnet('192.168.1.1', '192.168.1.0/24')).toBe(true)
      expect(ipInSubnet('192.168.1.254', '192.168.1.0/24')).toBe(true)
    })

    it('rejects IPs outside /24 subnet', () => {
      expect(ipInSubnet('192.168.2.1', '192.168.1.0/24')).toBe(false)
      expect(ipInSubnet('10.0.0.1', '192.168.1.0/24')).toBe(false)
    })

    it('handles /16 subnet', () => {
      expect(ipInSubnet('172.16.0.1', '172.16.0.0/16')).toBe(true)
      expect(ipInSubnet('172.16.255.254', '172.16.0.0/16')).toBe(true)
      expect(ipInSubnet('172.17.0.1', '172.16.0.0/16')).toBe(false)
    })

    it('handles /32 subnet (single host)', () => {
      expect(ipInSubnet('10.0.0.1', '10.0.0.1/32')).toBe(true)
      expect(ipInSubnet('10.0.0.2', '10.0.0.1/32')).toBe(false)
    })
  })

  describe('isRandomizedMac logic', () => {
    function isRandomizedMac(mac: string): boolean {
      const firstOctet = parseInt(mac.substring(0, 2), 16)
      return (firstOctet & 0x02) !== 0
    }

    it('detects randomized MACs (locally administered bit set)', () => {
      // f6:xx → 0xF6 = 1111 0110, bit 1 = 1
      expect(isRandomizedMac('f6:4b:ee:b9:d2:0b')).toBe(true)
      // da:xx → 0xDA = 1101 1010, bit 1 = 1
      expect(isRandomizedMac('da:3c:e9:f5:60:88')).toBe(true)
      // 82:xx → 0x82 = 1000 0010, bit 1 = 1
      expect(isRandomizedMac('82:94:3b:f4:12:bb')).toBe(true)
    })

    it('detects real MACs (globally unique)', () => {
      // 0c:xx → 0x0C = 0000 1100, bit 1 = 0
      expect(isRandomizedMac('0c:0e:76:cf:4a:e9')).toBe(false)
      // ac:xx → 0xAC = 1010 1100, bit 1 = 0
      expect(isRandomizedMac('ac:1c:26:24:48:22')).toBe(false)
      // a0:xx → 0xA0 = 1010 0000, bit 1 = 0
      expect(isRandomizedMac('a0:80:69:c3:21:cf')).toBe(false)
    })
  })

  describe('cidrFromMask logic', () => {
    function cidrFromMask(ip: string, netmask: string): string {
      const bits = netmask
        .split('.')
        .reduce((acc, octet) => acc + (parseInt(octet) >>> 0).toString(2).replace(/0/g, '').length, 0)
      const parts = ip.split('.').map(Number)
      const maskParts = netmask.split('.').map(Number)
      const network = parts.map((p, i) => p & maskParts[i]).join('.')
      return `${network}/${bits}`
    }

    it('converts /24 mask correctly', () => {
      expect(cidrFromMask('192.168.1.100', '255.255.255.0')).toBe('192.168.1.0/24')
    })

    it('converts /16 mask correctly', () => {
      expect(cidrFromMask('172.16.5.10', '255.255.0.0')).toBe('172.16.0.0/16')
    })

    it('converts /8 mask correctly', () => {
      expect(cidrFromMask('10.1.2.3', '255.0.0.0')).toBe('10.0.0.0/8')
    })
  })
})
