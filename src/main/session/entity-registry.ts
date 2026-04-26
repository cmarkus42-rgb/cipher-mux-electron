import * as os from 'os'
import type { EntityConfig, EntityId } from '../../shared/types'

/**
 * EntityRegistry — Registry for functional entity configurations.
 *
 * Entities are special sessions (Orchestrator, MPO, Companion, Refinement)
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
 * @param orchestratorDir Orchestrator working directory (from BRAND).
 * @param mpoDir MPO working directory (from BRAND).
 * @param appRoot App root for resolving template paths (process.resourcesPath or project root).
 */
export function registerBuiltinEntities(
  registry: EntityRegistry,
  orchestratorDir: string,
  mpoDir: string,
): void {
  const entitiesBase = expandHome('~/.config/cipher-mux/entities')

  registry.register({
    id: 'orchestrator',
    displayName: 'Orchestrator',
    icon: '🎯',
    color: '#4fc3f7',
    projectPath: expandHome(orchestratorDir),
    features: ['mcp'],
    visible: true,
  })

  registry.register({
    id: 'mpo',
    displayName: 'MPO',
    icon: '🔀',
    color: '#ab47bc',
    projectPath: expandHome(mpoDir),
    features: ['mcp'],
    visible: true,
  })

  registry.register({
    id: 'launcher',
    displayName: 'Launcher',
    icon: '🚀',
    color: '#66bb6a',
    projectPath: expandHome('~/.config/cipher-mux/launcher'),
    features: ['mcp'],
    visible: true,
  })

  registry.register({
    id: 'companion',
    displayName: 'Coding Companion',
    icon: '🧭',
    color: '#ffb74d',
    projectPath: `${entitiesBase}/companion`,
    templatePath: 'the how-to-session',
    startupGreeting: 'Wach auf. Lies dein Profil, check dein Gedaechtnis, und sag hallo.',
    features: ['mcp', 'memory'],
    visible: true,
  })

  registry.register({
    id: 'refinement',
    displayName: 'Refinement',
    icon: '🔬',
    color: '#ef5350',
    projectPath: `${entitiesBase}/refinement`,
    templatePath: 'the refinement session',
    features: ['mcp', 'memory'],
    visible: true,
  })

  registry.register({
    id: 'voice-relay',
    displayName: 'Voice',
    icon: '🎙',
    color: '#9b59b6',
    projectPath: `${entitiesBase}/voice-relay`,
    startupGreeting: 'Session gestartet. Warte auf Voice-Input.',
    features: ['mcp'],
    visible: true,
  })

  registry.register({
    id: 'audit',
    displayName: 'Audit',
    icon: '🛡',
    color: '#c0392b',
    projectPath: `${entitiesBase}/audit`,
    features: ['mcp'],
    visible: true,
  })
}
