// bws-shell-lint's state: the dashboard tab bws-cockpit draws (bws-kit/tab.ts ModTab), read there as unknown and checked.
declare module 'claude-code' {
  interface PluginState {
    'bws-shell-lint': { tab: unknown }
  }
}

// An export keeps this file a module, so the block above augments claude-code instead of replacing it.
export type TabState = unknown
