/**
 * Minimal stand-in for the `obsidian` module so the plugin's real Svelte
 * components and renderer can be bundled and screenshotted in a plain browser.
 * Only what the imported code touches at load/render time is implemented.
 */
export class Notice { constructor(_msg?: unknown) {} }
export class TFile {}
export class Vault {}
export class Menu {}
export class Plugin {}
export class ItemView {}
export class PluginSettingTab { constructor(..._a: unknown[]) {} }
export class Setting {}
export class DropdownComponent {}
export class WorkspaceLeaf {}
export const MarkdownRenderer = { render: async () => {} }
export const moment: any = () => ({ format: () => '' })
export const normalizePath = (p: string) => p
export const getAllTags = () => []
export type App = any
