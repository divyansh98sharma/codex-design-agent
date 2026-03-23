import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { z } from 'zod'

const OUTPUT_PATH = path.resolve('data/knowledge/index.json')
const token =
  process.env.FIGMA_PAT ||
  process.env.FIGMA_PERSONAL_ACCESS_TOKEN ||
  process.env.FIGMA_OAUTH_TOKEN

if (!token) {
  console.error('Missing Figma token. Set FIGMA_PAT, FIGMA_PERSONAL_ACCESS_TOKEN, or FIGMA_OAUTH_TOKEN.')
  process.exit(1)
}

const fileKeys = (process.env.FIGMA_FILE_KEYS || '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean)

if (fileKeys.length === 0) {
  console.error('No Figma file keys provided. Set FIGMA_FILE_KEYS as a comma-separated list.')
  process.exit(1)
}

const baseHeaders = {
  'X-Figma-Token': token,
  'Content-Type': 'application/json',
}

const variableSchema = z
  .object({
    status: z.number(),
    meta: z.object({
      variables: z.record(
        z.object({
          id: z.string(),
          name: z.string(),
          resolvedType: z.string(),
          description: z.string().optional(),
          scopes: z.array(z.string()).optional(),
          valuesByMode: z.record(z.any()).optional(),
          variableCollectionId: z.string().optional(),
        }),
      ),
      variableCollections: z
        .record(
          z.object({
            id: z.string(),
            name: z.string(),
            modes: z.array(z.object({ id: z.string(), name: z.string() })),
          }),
        )
        .optional(),
    }),
  })
  .transform((raw) => ({
    variables: Object.values(raw.meta.variables || {}),
    collections: Object.values(raw.meta.variableCollections || {}),
  }))

const componentSchema = z
  .object({
    status: z.number(),
    meta: z.object({
      components: z.record(
        z.object({
          key: z.string(),
          name: z.string(),
          description: z.string().optional(),
          componentSetId: z.string().optional(),
          documentationLinks: z
            .array(z.object({ uri: z.string(), title: z.string().nullable().optional() }))
            .optional(),
        }),
      ),
    }),
  })
  .transform((raw) => Object.values(raw.meta.components || {}))

const styleSchema = z
  .object({
    status: z.number(),
    meta: z.object({
      styles: z.record(
        z.object({
          key: z.string(),
          name: z.string(),
          styleType: z.string(),
          description: z.string().optional(),
        }),
      ),
    }),
  })
  .transform((raw) => Object.values(raw.meta.styles || {}))

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: baseHeaders })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Figma request failed (${response.status}): ${message}`)
  }
  return response.json()
}

interface KnowledgeChunk {
  id: string
  title: string
  body: string
  tags: string[]
  source: string
}

async function collectFromFile(fileKey: string): Promise<KnowledgeChunk[]> {
  const chunks: KnowledgeChunk[] = []
  const variableUrl = `https://api.figma.com/v1/files/${fileKey}/variables/local`
  const componentUrl = `https://api.figma.com/v1/files/${fileKey}/components`
  const styleUrl = `https://api.figma.com/v1/files/${fileKey}/styles`

  try {
    const rawVariables = await fetchJson(variableUrl)
    const variables = variableSchema.parse(rawVariables)
    const collectionLookup = new Map(
      variables.collections.map((collection) => [collection.id, collection]),
    )

    for (const variable of variables.variables) {
      const collection = variable.variableCollectionId
        ? collectionLookup.get(variable.variableCollectionId)
        : undefined
      const title = `Token · ${variable.name}`
      const description = variable.description ? `\nDescription: ${variable.description}` : ''
      const modeLines: string[] = []

      const collectionsModes = collection?.modes ?? []
      for (const mode of collectionsModes) {
        const value = variable.valuesByMode?.[mode.id]
        if (value !== undefined) {
          modeLines.push(`- ${mode.name}: ${JSON.stringify(value)}`)
        }
      }

      const bodySections = [
        `Type: ${variable.resolvedType}`,
        collection ? `Collection: ${collection.name}` : undefined,
        description,
        modeLines.length > 0 ? `Values by mode:\n${modeLines.join('\n')}` : undefined,
        variable.scopes ? `Scopes: ${variable.scopes.join(', ')}` : undefined,
      ].filter(Boolean)

      chunks.push({
        id: `${fileKey}-token-${variable.id}`,
        title,
        body: bodySections.join('\n'),
        tags: ['token', variable.resolvedType, collection?.name].filter(Boolean) as string[],
        source: fileKey,
      })
    }
  } catch (error) {
    console.warn(`Failed to load variables for ${fileKey}:`, error)
  }

  try {
    const rawComponents = await fetchJson(componentUrl)
    const components = componentSchema.parse(rawComponents)
    for (const component of components) {
      const links = component.documentationLinks?.map((link) => `${link.title ?? 'Doc'}: ${link.uri}`)
      const bodySections = [component.description?.trim(), links?.join('\n')]
        .filter(Boolean)
        .join('\n')

      chunks.push({
        id: `${fileKey}-component-${component.key}`,
        title: `Component · ${component.name}`,
        body: bodySections || 'No documentation provided.',
        tags: ['component'],
        source: fileKey,
      })
    }
  } catch (error) {
    console.warn(`Failed to load components for ${fileKey}:`, error)
  }

  try {
    const rawStyles = await fetchJson(styleUrl)
    const styles = styleSchema.parse(rawStyles)
    for (const style of styles) {
      const body = [
        `Type: ${style.styleType}`,
        style.description ? `Description: ${style.description}` : undefined,
      ]
        .filter(Boolean)
        .join('\n')

      chunks.push({
        id: `${fileKey}-style-${style.key}`,
        title: `Style · ${style.name}`,
        body: body || 'No documentation provided.',
        tags: ['style', style.styleType],
        source: fileKey,
      })
    }
  } catch (error) {
    console.warn(`Failed to load styles for ${fileKey}:`, error)
  }

  return chunks
}

async function main() {
  const allChunks: KnowledgeChunk[] = []
  for (const key of fileKeys) {
    console.log(`Collecting data from Figma file ${key}…`)
    const chunks = await collectFromFile(key)
    allChunks.push(...chunks)
  }

  if (allChunks.length === 0) {
    console.warn('No chunks collected from Figma. The output will not be updated.')
    return
  }

  const knowledge = {
    version: '0.1.0',
    generatedAt: new Date().toISOString(),
    sources: fileKeys,
    chunkCount: allChunks.length,
    chunks: allChunks,
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(knowledge, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${allChunks.length} knowledge chunks to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error('Failed to synchronize Figma data:', error)
  process.exit(1)
})
