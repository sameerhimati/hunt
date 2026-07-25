/**
 * Load order for the ⌘K registry. Each side-effect import registers one area's
 * commands; a phase that builds a new area adds its own line here and touches
 * nothing else in the palette.
 */
import './core'

export * from './registry'
