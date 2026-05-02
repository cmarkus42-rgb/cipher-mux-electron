// src/main/ideation-partner/index.ts — Re-exports

export { initBrainDir, createNote, listNotes, readNote, updateIndex, checkUncertaintyMarkers } from './brain-manager'
export { KNOWN_SKILLS, listSkills, readSkill, suggestSkillsForPhase } from './skill-registry'
export { generateTemplate, writeAnforderungspaket, validateAnforderungspaket } from './anforderungspaket-generator'
export { syncIdeationTemplate, isV2Template, generateV2Template } from './ideation-template'
export { ANFORDERUNGSPAKET_FIELDS } from './types'
export type { IdeationRun, BrainNote, Brief, RobustnessGate, Anforderungspaket } from './types'
