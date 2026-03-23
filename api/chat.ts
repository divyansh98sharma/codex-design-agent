import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { z } from 'zod'

const bodySchema = z.object({
  question: z.string().min(1),
  context: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        body: z.string(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .max(10)
    .default([]),
})

function normalizeBody(req: VercelRequest) {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch (error) {
      console.warn('Failed to parse string body as JSON', error)
      return {}
    }
  }

  const payload = (req as unknown as { rawBody?: string }).rawBody
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch (error) {
      console.warn('Failed to parse rawBody as JSON', error)
      return {}
    }
  }

  return {}
}

function buildPrompt(question: string, context: { title: string; body: string }[]): string {
  const contextText = context
    .map((chunk, index) => `# Source ${index + 1}: ${chunk.title}\n${chunk.body}`)
    .join('\n\n')

  return `You are "Spec Scribe", a design-system specialist. Answer questions using ONLY the supplied context. If the context does not contain the answer, say "I don\'t have that information yet." Be concise, prefer bullet lists only when enumerating tokens/components, and highlight exact token names with backticks.\n\nContext:\n${contextText || 'No context provided.'}\n\nQuestion: ${question}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const parsed = bodySchema.safeParse(normalizeBody(req))
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request payload', details: parsed.error.flatten() })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable' })
    return
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const openai = new OpenAI({ apiKey })
  const { question, context } = parsed.data

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a helpful design-system specialist.' },
        { role: 'user', content: buildPrompt(question, context) },
      ],
    })

    const answer = completion.choices[0]?.message?.content?.trim()
    if (!answer) {
      res.status(502).json({ error: 'No answer generated from model' })
      return
    }

    res.status(200).json({ answer, model, tokens: completion.usage })
  } catch (error) {
    console.error('OpenAI request failed:', error)
    res.status(502).json({ error: 'Upstream model request failed' })
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}
