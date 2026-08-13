/// <reference types="vite/client" />

declare module '*.glb' {
  const url: string
  export default url
}

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

interface Navigator {
  connection?: NetworkInformation
  deviceMemory?: number
}
