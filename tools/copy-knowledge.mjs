import fs from 'node:fs/promises'
import path from 'node:path'

const source = path.resolve('data/knowledge/index.json')
const destinationDir = path.resolve('frontend/public/data/knowledge')
const destination = path.join(destinationDir, 'index.json')

async function copy() {
  try {
    await fs.access(source)
  } catch (error) {
    console.warn(`Knowledge base missing at ${source}. Run npm run sync:figma first.`)
    return
  }

  await fs.mkdir(destinationDir, { recursive: true })
  await fs.copyFile(source, destination)
  console.log(`Copied knowledge base to ${destination}`)
}

copy().catch((error) => {
  console.error('Failed to copy knowledge base:', error)
  process.exit(1)
})
