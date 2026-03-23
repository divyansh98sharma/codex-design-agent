import type { KnowledgeChunk } from '../types'

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function scoreChunk(chunk: KnowledgeChunk, queryTokens: string[]): number {
  const haystack = tokenize(`${chunk.title} ${chunk.body}`)
  if (haystack.length === 0) return 0

  const haystackSet = new Set(haystack)
  let score = 0

  for (const token of queryTokens) {
    if (haystackSet.has(token)) {
      score += 3
    } else {
      for (const word of haystack) {
        if (word.startsWith(token)) {
          score += 1
          break
        }
      }
    }
  }

  if (chunk.tags) {
    for (const tag of chunk.tags) {
      if (queryTokens.includes(tag.toLowerCase())) {
        score += 2
      }
    }
  }

  return score
}

export function rankChunks(chunks: KnowledgeChunk[], query: string, limit = 6): KnowledgeChunk[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  return [...chunks]
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk)
}
