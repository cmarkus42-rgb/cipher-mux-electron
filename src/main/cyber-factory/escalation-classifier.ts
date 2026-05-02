/** Cyber Factory — escalation classifier (Phase 6) */

import type { EscalationLevel } from './types'

export interface EscalationInput {
  question: string
  detailSpecContent: string
  crossSessionDecisions: Array<{ sessionId: string; decision: string }>
  hasWebSearchCapability: boolean
}

export interface EscalationResult {
  level: EscalationLevel
  reasoning: string
  autonomous: boolean
}

/**
 * Classify an escalation into one of 5 levels based on available context.
 *
 * Level 1 — Answer found directly in detail spec (keyword overlap)
 * Level 2 — Derivable from stack constraints (spec has content, no direct match)
 * Level 3 — Cross-session compatible decision exists
 * Level 4 — Web search capability available
 * Level 5 — No context available; requires user input
 */
export function classifyEscalation(input: EscalationInput): EscalationResult {
  const { question, detailSpecContent, crossSessionDecisions, hasWebSearchCapability } = input

  // Level 1: keyword overlap between question and spec
  if (detailSpecContent.trim().length > 0) {
    const questionLower = question.toLowerCase()
    const specLower = detailSpecContent.toLowerCase()
    const questionWords = tokenizeArray(question)
    const specWords = tokenizeArray(detailSpecContent)
    const questionWordsSet = new Set(questionWords)

    // Direct keyword overlap: spec word in question text, or question word in spec text
    const directOverlap =
      specWords.some((w) => questionWordsSet.has(w)) ||
      specWords.some((w) => questionLower.includes(w)) ||
      questionWords.some((w) => specLower.includes(w))

    // Decision-indicative words signal the spec contains an explicit answer
    const DECISION_WORDS = ['first', 'primary', 'use', 'adopt', 'preferred', 'architecture',
      'pattern', 'approach', 'strategy', 'chosen', 'selected', 'default', 'standard']
    const specHasDecision = DECISION_WORDS.some((w) => specLower.includes(w))

    if (directOverlap || specHasDecision) {
      return {
        level: 1,
        reasoning: 'Answer derivable directly from spec content (keyword overlap found)',
        autonomous: true,
      }
    }

    // Level 2: spec has content but no direct keyword match — stack constraints apply
    return {
      level: 2,
      reasoning: 'No direct keyword match but spec defines stack constraints — decision derivable',
      autonomous: true,
    }
  }

  // Level 3: cross-session compatible decision exists
  if (crossSessionDecisions.length > 0) {
    const decisions = crossSessionDecisions.map((d) => d.decision).join('; ')
    return {
      level: 3,
      reasoning: `Cross-session decision available: ${decisions}`,
      autonomous: true,
    }
  }

  // Level 4: web search can resolve the question
  if (hasWebSearchCapability) {
    return {
      level: 4,
      reasoning: 'No spec or cross-session context; web search available to resolve question',
      autonomous: true,
    }
  }

  // Level 5: no context available — needs user input
  return {
    level: 5,
    reasoning: 'No spec, no cross-session decisions, no web search — requires user input',
    autonomous: false,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tokenize a string into lowercase words of 3+ chars, returned as a Set. */
function tokenize(text: string): Set<string> {
  return new Set(tokenizeArray(text))
}

/** Tokenize a string into lowercase words of 2+ chars, returned as an Array. */
function tokenizeArray(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 2)
}
