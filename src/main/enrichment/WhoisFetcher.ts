/**
 * WhoisFetcher — performs a WHOIS lookup for an IP address.
 * Uses the `node-whois` package.
 */
export async function fetchWhois(ip: string): Promise<string> {
  try {
    const whoisMod = await import('node-whois')
    const whois = (whoisMod as any).default ?? whoisMod
    const lookup: Function = whois.lookup ?? whois
    return await new Promise<string>((resolve, reject) => {
      lookup(ip, (err: Error | null, data: string) => {
        if (err) reject(err)
        else resolve(data ?? 'No WHOIS data found.')
      })
    })
  } catch (err) {
    return `WHOIS lookup failed: ${err}`
  }
}
