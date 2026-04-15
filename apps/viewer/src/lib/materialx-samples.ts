export interface MaterialXSamplePack {
  id: string
  label: string
  directory: string
  materialFile: 'material.mtlx'
  assets: string[]
}

export interface LoadedMaterialXSample {
  xml: string
  assets: Record<string, string>
}
