import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChatMessage } from './components/ChatMessage'
import { rankChunks } from './lib/rank'
import type { AgentMessage, KnowledgeBase, KnowledgeChunk } from './types'
import './App.css'

const API_URL = import.meta.env.VITE_AGENT_API_URL || '/api/chat'

const initialMessage: AgentMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hi! Share a question about the design system. I will combine Figma tokens, components, and styles to answer.',
  createdAt: Date.now(),
}

async function sendToAgent(question: string, context: KnowledgeChunk[]): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to contact agent API')
  }

  const payload = (await response.json()) as { answer: string }
  return payload.answer
}

function useKnowledgeBase() {
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/knowledge/index.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load knowledge base (${response.status})`)
        }
        return response.json()
      })
      .then((payload) => setKnowledgeBase(payload as KnowledgeBase))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        console.error('Failed to load knowledge base', err)
        setError('Knowledge base not available yet. Run npm run sync:figma to generate it.')
      })

    return () => controller.abort()
  }, [])

  return { knowledgeBase, error }
}

export default function App() {
  const { knowledgeBase, error } = useKnowledgeBase()
  const [messages, setMessages] = useState<AgentMessage[]>([initialMessage])
  const [question, setQuestion] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [contextPreview, setContextPreview] = useState<KnowledgeChunk[]>([])

  const chunks = knowledgeBase?.chunks ?? []

  useEffect(() => {
    setContextPreview(rankChunks(chunks, question, 4))
  }, [question, chunks])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return

    const context = rankChunks(chunks, trimmed, 6)
    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, userMessage])
    setQuestion('')
    setIsStreaming(true)

    try {
      const answer = await sendToAgent(trimmed, context)
      const assistantMessage: AgentMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: answer,
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'I could not reach the agent API. Check the console for details.',
          createdAt: Date.now(),
        },
      ])
    } finally {
      setIsStreaming(false)
    }
  }

  const contextInfo = useMemo(() => {
    if (contextPreview.length === 0 || !question.trim()) return null
    return (
      <aside className="context-preview" aria-live="polite">
        <h2>Context I will use</h2>
        <ul>
          {contextPreview.map((chunk) => (
            <li key={chunk.id}>
              <strong>{chunk.title}</strong>
              <p>
                {chunk.body.slice(0, 160)}
                {chunk.body.length > 160 ? '…' : ''}
              </p>
            </li>
          ))}
        </ul>
      </aside>
    )
  }, [contextPreview, question])

  return (
    <div className="app-shell">
      <header>
        <div className="title-block">
          <span className="spark">?</span>
          <div>
            <h1>Design System Agent</h1>
            <p>
              Answers are grounded in your synced Figma tokens, components, and styles. Publish this site with GitHub Pages
              and deploy the API on Vercel.
            </p>
          </div>
        </div>
        <div className="meta">
          {knowledgeBase?.generatedAt ? (
            <span>Knowledge updated {new Date(knowledgeBase.generatedAt).toLocaleString()}</span>
          ) : (
            <span>Knowledge base pending sync</span>
          )}
        </div>
      </header>

      <main>
        <div className="chat-column">
          <div className="chat-window" role="log" aria-live="polite">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isStreaming && (
              <div className="chat-message chat-message--assistant">
                <div className="chat-message__avatar" aria-hidden>
                  ?
                </div>
                <div className="chat-message__bubble loading">Formulating answer…</div>
              </div>
            )}
          </div>

          <form className="chat-input" onSubmit={handleSubmit}>
            <label htmlFor="question" className="sr-only">
              Ask a question about the design system
            </label>
            <textarea
              id="question"
              name="question"
              placeholder="How do I use the primary button at small size?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={isStreaming}
              rows={3}
            />
            <div className="form-actions">
              <button type="submit" disabled={isStreaming || !question.trim()}>
                {isStreaming ? 'Thinking…' : 'Ask'}
              </button>
            </div>
          </form>
          {error && <p className="inline-error">{error}</p>}
        </div>
        {contextInfo}
      </main>
    </div>
  )
}
