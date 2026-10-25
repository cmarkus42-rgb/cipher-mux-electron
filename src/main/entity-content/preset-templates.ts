/**
 * Welche Rollen eine Code-Vorlage haben, die veralten kann.
 *
 * Nur **write-once**-Rollen stehen hier. `audit` und `voice-relay` werden bei
 * jedem Sessionstart neu geschrieben und koennen deshalb gar nicht
 * zurueckfallen; sie aufzunehmen hiesse, nach etwas zu suchen, das es nicht
 * geben kann. Handgeschriebene Presets (workshop, cyber-factory, mpo, …) haben
 * keine Vorlage, gegen die man vergleichen koennte.
 *
 * Wer eine Rolle auf write-once umstellt, traegt sie hier nach — sonst faellt
 * ihr Rueckstand wieder niemandem auf.
 */

import { generateCompanionClaudeMd } from './companion-preset'
import { generateRefinementClaudeMd, generateIdeationPartnerClaudeMd } from './index'
import { generateLocalWorkshopPreset } from '../local-factory/workshop-preset'
import { generateLocalFactoryPreset } from '../local-factory/presets'
import { generateDebuggerClaudeMd } from '../debugger/debugger-template'
import { generateSystemsEngineerPreset } from '../systems-engineer/se-preset'

export const PRESET_TEMPLATES: Readonly<Record<string, () => string>> = {
  companion: generateCompanionClaudeMd,
  refinement: generateRefinementClaudeMd,
  'ideation-partner': generateIdeationPartnerClaudeMd,
  debugger: generateDebuggerClaudeMd,
  'local-workshop': generateLocalWorkshopPreset,
  'systems-engineer': generateSystemsEngineerPreset,
  'local-factory': generateLocalFactoryPreset,
}

/** Die Vorlage einer Rolle, oder `null` wenn sie keine hat. */
export function presetTemplateFor(entityId: string): string | null {
  const gen = PRESET_TEMPLATES[entityId]
  if (!gen) return null
  try {
    return gen()
  } catch {
    // Ein Generator, der wirft, darf den Preset-Editor nicht mitreissen.
    return null
  }
}
