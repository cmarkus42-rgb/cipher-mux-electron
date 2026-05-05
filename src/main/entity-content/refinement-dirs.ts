import * as fs from 'fs';
import * as path from 'path';

const BRAIN_INDEX_CONTENT = `# Brain — Index

## LLM-Provider-Settings (Trockenlauf 2026-04-25)

Die Idee begann als "Bug-Assistant soll andere LLMs nutzen koennen", stellte sich aber schnell als breiter heraus: cipher-mux hat bereits zwei LLM-Consumer ([[seed-llm-provider|BugreportInterview und NoteTagging]]), und weitere werden folgen.

Der zentrale Spannungspunkt ist Minimalismus vs. Flexibilitaet: ein generisches Interface das heute zwei Consumer bedient, morgen fuenf, ohne zum Konfigurationsmonster zu werden. Die [[brief-llm-provider|Richtungsentscheidung]] setzt auf einen globalen Provider mit bewusst minimaler API — per-Feature Override kommt erst wenn es wirklich gebraucht wird.

Drei Risiken aus dem Pre-Mortem verdienen Aufmerksamkeit: API-Inkompatibilitaeten bei "OpenAI-kompatiblen" Providern, Klartext-Keys auf Disk, und Interface-Creep. Alle drei sind im Requirements-Dokument als bewusste Entscheidungen dokumentiert.
`;

export function deployRefinementDirs(projectPath: string): void {
  // brain/ with _index.md
  const brainDir = path.join(projectPath, 'brain');
  const indexPath = path.join(brainDir, '_index.md');
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(brainDir, { recursive: true });
    fs.writeFileSync(indexPath, BRAIN_INDEX_CONTENT, 'utf-8');
  }

  // deliverables/ with .gitkeep
  const deliverablesDir = path.join(projectPath, 'deliverables');
  const gitkeepPath = path.join(deliverablesDir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.mkdirSync(deliverablesDir, { recursive: true });
    fs.writeFileSync(gitkeepPath, '', 'utf-8');
  }
}
