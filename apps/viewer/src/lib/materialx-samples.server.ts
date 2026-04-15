import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LoadedMaterialXSample, MaterialXSamplePack } from './materialx-samples'

const EXAMPLES_DIR = fileURLToPath(new URL('../../public/examples', import.meta.url))
const MATERIAL_FILENAME = 'material.mtlx'
const PRIMARY_LABEL_FILENAME = 'index.txt'
const LEGACY_LABEL_FILENAME = 'info.txt'

let samplesCache: MaterialXSamplePack[] | null = null
let samplesPromise: Promise<MaterialXSamplePack[]> | null = null

const makeSampleId = (directory: string): string => {
  return directory.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')
}

const toPosixPath = (value: string): string => value.replaceAll(path.sep, '/')

const toTitleCase = (value: string): string => {
  return value
    .replaceAll(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

const readFirstLine = async (filePath: string): Promise<string | undefined> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const line = raw
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0)
    return line
  } catch {
    return undefined
  }
}

const scanAssetFiles = async (rootDir: string, relativeDir = ''): Promise<string[]> => {
  const absoluteDir = relativeDir ? path.join(rootDir, relativeDir) : rootDir
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true })
  const assets: string[] = []

  for (const entry of entries) {
    const childRelativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name
    if (entry.isDirectory()) {
      assets.push(...(await scanAssetFiles(rootDir, childRelativePath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const normalized = toPosixPath(childRelativePath)
    const basename = path.posix.basename(normalized)
    if (
      basename === MATERIAL_FILENAME ||
      basename === PRIMARY_LABEL_FILENAME ||
      basename === LEGACY_LABEL_FILENAME
    ) {
      continue
    }

    assets.push(normalized)
  }

  return assets
}

const loadSamplesFromFs = async (): Promise<MaterialXSamplePack[]> => {
  const entries = await fs.readdir(EXAMPLES_DIR, { withFileTypes: true })
  const samples: MaterialXSamplePack[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const directory = entry.name
    const sampleRoot = path.join(EXAMPLES_DIR, directory)
    const materialFilePath = path.join(sampleRoot, MATERIAL_FILENAME)

    try {
      const stat = await fs.stat(materialFilePath)
      if (!stat.isFile()) {
        continue
      }
    } catch {
      console.warn(`Skipping sample directory "${directory}" because ${MATERIAL_FILENAME} is missing`)
      continue
    }

    const label =
      (await readFirstLine(path.join(sampleRoot, PRIMARY_LABEL_FILENAME))) ??
      (await readFirstLine(path.join(sampleRoot, LEGACY_LABEL_FILENAME))) ??
      toTitleCase(directory)

    const assets = (await scanAssetFiles(sampleRoot)).sort((a, b) => a.localeCompare(b))

    samples.push({
      id: makeSampleId(directory),
      label,
      directory,
      materialFile: MATERIAL_FILENAME,
      assets,
    })
  }

  return samples.sort((a, b) => a.label.localeCompare(b.label))
}

export const getMaterialXSamplePacksCached = async (): Promise<MaterialXSamplePack[]> => {
  if (samplesCache) {
    return samplesCache
  }

  if (samplesPromise) {
    return samplesPromise
  }

  samplesPromise = loadSamplesFromFs()
    .then((samples) => {
      samplesCache = samples
      return samples
    })
    .finally(() => {
      samplesPromise = null
    })

  return samplesPromise
}

const createAssetMap = (sample: MaterialXSamplePack): Record<string, string> => {
  const root = `/examples/${sample.directory}`
  const out: Record<string, string> = {}
  for (const asset of sample.assets) {
    out[asset] = `${root}/${asset}`
  }
  return out
}

export const loadMaterialXSampleByIdFromFs = async (sampleId: string): Promise<LoadedMaterialXSample> => {
  const samples = await getMaterialXSamplePacksCached()
  const sample = samples.find((entry) => entry.id === sampleId)
  if (!sample) {
    throw new Error(`Could not find sample: ${sampleId}`)
  }

  const sampleRoot = path.join(EXAMPLES_DIR, sample.directory)
  const xmlPath = path.join(sampleRoot, MATERIAL_FILENAME)
  const xml = await fs.readFile(xmlPath, 'utf8')

  return {
    xml,
    assets: createAssetMap(sample),
  }
}
