// src/main/testing-assistant/adversarial-prober.ts

export type AdversarialDepth = 'shallow' | 'standard' | 'deep'

export interface ProbeSpec {
  category: string
  description: string
  inputExample: string
}

const PROBE_CATEGORIES: Record<AdversarialDepth, string[]> = {
  shallow: ['empty-input', 'boundary-conditions'],
  standard: ['empty-input', 'large-input', 'unicode', 'boundary-conditions', 'unauthorized-access'],
  deep: ['empty-input', 'large-input', 'unicode', 'race-conditions', 'boundary-conditions', 'unauthorized-access', 'auth-bypass'],
}

const PROBE_TEMPLATES: Record<string, ProbeSpec[]> = {
  'empty-input': [
    { category: 'empty-input', description: 'Empty string input', inputExample: '""' },
    { category: 'empty-input', description: 'Null/undefined input', inputExample: 'null' },
    { category: 'empty-input', description: 'Empty array input', inputExample: '[]' },
  ],
  'large-input': [
    { category: 'large-input', description: 'String 10x typical size', inputExample: '"A".repeat(100000)' },
    { category: 'large-input', description: 'Array with 10000 items', inputExample: 'Array(10000).fill(0)' },
  ],
  'unicode': [
    { category: 'unicode', description: 'Emoji in string fields', inputExample: '"Hello world"' },
    { category: 'unicode', description: 'RTL text', inputExample: 'Arabic/Hebrew text' },
    { category: 'unicode', description: 'Zero-width chars', inputExample: '"hell\\u200Bo"' },
  ],
  'boundary-conditions': [
    { category: 'boundary-conditions', description: 'Integer overflow (MAX_SAFE_INTEGER)', inputExample: 'Number.MAX_SAFE_INTEGER + 1' },
    { category: 'boundary-conditions', description: 'Negative index', inputExample: '-1' },
    { category: 'boundary-conditions', description: 'Zero value', inputExample: '0' },
  ],
  'race-conditions': [
    { category: 'race-conditions', description: 'Two concurrent requests to same resource', inputExample: 'Promise.all([req1(), req2()])' },
  ],
  'unauthorized-access': [
    { category: 'unauthorized-access', description: 'No auth token', inputExample: 'headers: {}' },
    { category: 'unauthorized-access', description: 'Expired token', inputExample: 'headers: { Authorization: "Bearer expired" }' },
  ],
  'auth-bypass': [
    { category: 'auth-bypass', description: 'Direct URL access to admin endpoint', inputExample: 'GET /api/admin/users (no auth)' },
  ],
}

export function generateProbeSpecs(depth: AdversarialDepth): ProbeSpec[] {
  const categories = PROBE_CATEGORIES[depth]
  const specs: ProbeSpec[] = []
  for (const cat of categories) {
    specs.push(...(PROBE_TEMPLATES[cat] || []))
  }
  return specs
}

export function probeCount(depth: AdversarialDepth): number {
  return generateProbeSpecs(depth).length
}
