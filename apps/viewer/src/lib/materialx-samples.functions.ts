import { createServerFn } from '@tanstack/react-start'
import { getMaterialXSamplePacksCached, loadMaterialXSampleByIdFromFs } from './materialx-samples.server'

export const getMaterialXSamplePacks = createServerFn({ method: 'GET' }).handler(async () => {
  return getMaterialXSamplePacksCached()
})

export const loadMaterialXSampleById = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    return loadMaterialXSampleByIdFromFs(data.id)
  })
