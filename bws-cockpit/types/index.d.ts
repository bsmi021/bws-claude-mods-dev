export type CockpitRun = {
  folder: string
  next?: string
  finish?: string
  open: number
}

export type CockpitDevices = {
  ue: string
  unity: string
  blender: string
  adb: string
  vram: string
  isPressure: boolean
}

export type CockpitView = {
  run: CockpitRun | null
  devices: CockpitDevices | null
  lastGuard: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'bws-cockpit': { view: CockpitView | null; isHidden: boolean }
  }
}
