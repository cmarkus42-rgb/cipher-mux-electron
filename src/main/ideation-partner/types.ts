// src/main/ideation-partner/types.ts — Ideation Partner data types

export interface IdeationRun {
  id: string
  name: string
  brainDir: string
  seedPath: string | null
  status: 'active' | 'completed' | 'abandoned'
  startedAt: number
}

export interface BrainNote {
  id: string
  title: string
  filepath: string
  createdAt: number
}

export interface Brief {
  filepath: string
  /** Whether the brief passes the hardness check (summarizable in 5 sentences). */
  passesHardenessCheck: boolean
}

export interface RobustnessGate {
  skillUsed: string | null
  findings: string
  /** Whether phase 3 was marked as implicit. */
  implicit: boolean
}

export interface Anforderungspaket {
  filepath: string
  /** Fields that are present in the package. */
  presentFields: string[]
  /** Fields that are missing. */
  missingFields: string[]
  /** Whether the package is complete enough for Refinement handoff. */
  isComplete: boolean
}

/** Required fields in every Anforderungspaket. */
export const ANFORDERUNGSPAKET_FIELDS = [
  'Projektziel',
  'Zielgruppe',
  'Funktionale Anforderungen',
  'Meta-Requirements',
  'Wirksamkeits-Test',
  'Ausgeschlossener Scope',
] as const
