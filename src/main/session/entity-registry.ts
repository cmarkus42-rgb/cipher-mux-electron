import * as os from 'os'
import type { EntityConfig, EntityId } from '../../shared/types'

/**
 * EntityRegistry — Registry for functional entity configurations.
 *
 * Entities are special sessions (Workshop, Cyber Factory, Companion, Refinement)
 * with predefined behavior, assets, and UI styling. The registry holds their
 * configs and maps running sessions back to their entity type.
 */
export class EntityRegistry {
  private entities: Map<EntityId, EntityConfig> = new Map()
  private sessionToEntity: Map<string, EntityId> = new Map()

  /** Register an entity configuration. */
  register(config: EntityConfig): void {
    this.entities.set(config.id, config)
  }

  /** Get entity config by ID. */
  get(entityId: EntityId): EntityConfig | undefined {
    return this.entities.get(entityId)
  }

  /** List all registered entity configs. */
  list(): EntityConfig[] {
    return Array.from(this.entities.values())
  }

  /** Associate a session ID with an entity. */
  linkSession(sessionId: string, entityId: EntityId): void {
    this.sessionToEntity.set(sessionId, entityId)
  }

  /** Remove a session-to-entity association. */
  unlinkSession(sessionId: string): void {
    this.sessionToEntity.delete(sessionId)
  }

  /** Get entity config for a given session ID. */
  getBySessionId(sessionId: string): EntityConfig | undefined {
    const entityId = this.sessionToEntity.get(sessionId)
    if (!entityId) return undefined
    return this.entities.get(entityId)
  }

  /** Get entity ID for a given session ID. */
  getEntityIdForSession(sessionId: string): EntityId | undefined {
    return this.sessionToEntity.get(sessionId)
  }
}

/** Expand ~ to home directory. */
function expandHome(p: string): string {
  return p.replace(/^~/, os.homedir())
}

/**
 * Register all built-in entities. Called at app startup.
 * @param registry The entity registry to populate.
 * @param workshopDir Workshop working directory (from BRAND).
 * @param cyberFactoryDir Cyber Factory working directory (from BRAND).
 * @param appRoot App root for resolving template paths (process.resourcesPath or project root).
 */
// Modell-Defaults (Entscheidung des Users, 2026-10-24): Opus führt (nur der
// Systems Engineer), Sonnet baut und prüft, Haiku arbeitet zu. Die Werte sind
// Claude-Code-Aliase und gelten nur, wenn die Rolle über claude-code läuft
// (`entity-runtime.ts`); ein User-Override in den Einstellungen schlägt sie.
export function registerBuiltinEntities(
  registry: EntityRegistry,
  _workshopDir?: string,
  _cyberFactoryDir?: string,
): void {
  const entitiesBase = expandHome('~/.config/cipher-mux/entities')

  registry.register({
    id: 'systems-engineer',
    model: 'opus',
    displayName: 'Systems Engineer',
    icon: '🎯',
    color: '#ffd54f',
    projectPath: `${entitiesBase}/systems-engineer`,
    features: ['mcp'],
    visible: true,
    sortOrder: 5,
    // Einmal pro Workspace — und damit die einzige Opus-Session dort.
    singleInstance: true,
  })

  registry.register({
    id: 'workshop',
    model: 'sonnet',
    displayName: 'Workshop',
    icon: '🔨',
    color: '#4fc3f7',
    projectPath: `${entitiesBase}/workshop`,
    features: ['mcp'],
    visible: true,
    sortOrder: 70,
    singleInstance: true,
  })

  registry.register({
    id: 'cyber-factory',
    model: 'sonnet',
    displayName: 'Cyber Factory',
    icon: '🏭',
    color: '#ab47bc',
    projectPath: `${entitiesBase}/cyber-factory`,
    features: ['mcp'],
    visible: true,
    sortOrder: 40,
    singleInstance: true,
  })

  registry.register({
    id: 'local-factory',
    model: 'sonnet',
    displayName: 'Local Cyber Factory',
    icon: '🏗️',
    color: '#8e24aa',
    projectPath: `${entitiesBase}/local-factory`,
    features: ['mcp'],
    visible: true,
    sortOrder: 41,
    singleInstance: true,
  })

  registry.register({
    id: 'local-worker',
    displayName: 'Local Worker',
    icon: '⚙️',
    color: '#6d4c41',
    projectPath: `${entitiesBase}/local-worker`,
    features: ['mcp'],
    visible: true,
    sortOrder: 42,
    // Nacheinander (Spec E2) ist damit eine Eigenschaft der Registry.
    singleInstance: true,
    adapterId: 'opencode',
  })

  registry.register({
    id: 'local-workshop',
    model: 'sonnet',
    displayName: 'Local Workshop',
    icon: '🛠️',
    color: '#00897b',
    projectPath: `${entitiesBase}/local-workshop`,
    features: ['mcp'],
    visible: true,
    sortOrder: 43,
    singleInstance: true,
  })

  registry.register({
    id: 'launcher',
    model: 'haiku',
    displayName: 'Launcher',
    icon: '🚀',
    color: '#66bb6a',
    projectPath: expandHome('~/.config/cipher-mux/launcher'),
    features: ['mcp'],
    visible: false,
    sortOrder: 30,
    singleInstance: true,
  })

  registry.register({
    id: 'companion',
    model: 'sonnet',
    displayName: 'Coding Companion',
    icon: '🧭',
    color: '#ffb74d',
    projectPath: `${entitiesBase}/companion`,

    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 10,
  })

  registry.register({
    id: 'refinement',
    model: 'sonnet',
    displayName: 'Refinement',
    icon: '🔬',
    color: '#ef5350',
    projectPath: `${entitiesBase}/refinement`,

    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 30,
  })

  registry.register({
    id: 'ideation-partner',
    model: 'sonnet',
    displayName: 'Ideation Partner',
    icon: '💡',
    color: '#26a69a',
    projectPath: `${entitiesBase}/ideation-partner`,

    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 20,
  })

  registry.register({
    id: 'voice-relay',
    model: 'haiku',
    displayName: 'Voice',
    icon: '🎙',
    color: '#9b59b6',
    projectPath: `${entitiesBase}/voice-relay`,
    startupGreeting: 'Session gestartet. Warte auf Voice-Input.',
    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 90,
  })

  registry.register({
    id: 'audit',
    model: 'sonnet',
    displayName: 'Audit',
    icon: '🛡',
    color: '#c0392b',
    projectPath: `${entitiesBase}/audit`,
    features: ['mcp'],
    visible: true,
    sortOrder: 80,
  })

  registry.register({
    id: 'debugger',
    model: 'sonnet',
    displayName: 'Debugger',
    icon: '🔧',
    color: '#ff7043',
    projectPath: `${entitiesBase}/debugger`,
    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 60,
    singleInstance: true,
  })

  registry.register({
    id: 'testing-assistant',
    model: 'sonnet',
    displayName: 'Testing Assistant',
    icon: '\uD83E\uDDEA',
    color: '#2ecc71',
    projectPath: `${entitiesBase}/testing-assistant`,
    features: ['mcp', 'memory'],
    visible: true,
    sortOrder: 50,
    singleInstance: true,
  })

}
