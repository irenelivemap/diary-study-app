/**
 * Small tag-lab formatting and helper utilities.
 */
import type { TagDefinition } from './types'

export const DEFAULT_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#7c3aed', '#e11d48', '#0891b2']
export const UNTAGGED_FILTER = '__without_tags__'

export function readableTextColor(hex: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#0f172a'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff'
}

export function normalizeLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').slice(0, 40)
}

export function sortTags(tags: TagDefinition[]) {
  return [...tags].sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label))
}

export function tagGroup(tags: TagDefinition[], parentId: string | null) {
  return sortTags(tags.filter((tag) => tag.parentId === parentId))
}

export function isThemeTag(tag: TagDefinition) {
  return tag.isTheme
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
