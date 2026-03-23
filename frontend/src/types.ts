export interface KnowledgeChunk {
  id: string
  title: string
  body: string
  tags?: string[]
}

export interface KnowledgeBase {
  version: string
  generatedAt: string
  sources?: string[]
  chunkCount?: number
  chunks: KnowledgeChunk[]
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}
