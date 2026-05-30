import { Layers, List } from 'lucide-react'

/**
 * Bucket history records by a target key, preserving first-seen order. Since
 * history lists are newest-first, the most-recently-active target sorts first
 * and each group's rows stay newest-first within it.
 */
export function groupByKey<T>(items: T[], key: (item: T) => string): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    const arr = map.get(k)
    if (arr) arr.push(it)
    else map.set(k, [it])
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, items: v }))
}

/** Shared "Group by target" / "Flat list" toggle used by every history table. */
export function GroupToggle({ grouped, onToggle }: { grouped: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onToggle}
      title={grouped ? 'Show as a flat list' : 'Group entries by target'}
      className={`inline-flex items-center gap-1 text-[12px] transition-colors ${
        grouped ? 'text-accent-blue' : 'text-fg-subtle hover:text-fg-default'
      }`}
    >
      {grouped ? <List className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
      {grouped ? 'Flat list' : 'Group by target'}
    </button>
  )
}
