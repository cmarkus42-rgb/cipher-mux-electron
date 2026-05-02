export interface VerificationResult {
  allPassed: boolean
  totalTests: number
  failures: number
  rawOutput: string
}

/**
 * VerificationRunner — parses test output and determines phase transition eligibility.
 * Does NOT execute tests itself (that happens via tmux in the worker session).
 */
export class VerificationRunner {
  /** Parse Node.js test runner output into structured result. */
  parseTestOutput(output: string): VerificationResult {
    const totalMatch = output.match(/tests\s+(\d+)/i)
    const failMatch = output.match(/fail\s+(\d+)/i)

    const totalTests = totalMatch ? parseInt(totalMatch[1], 10) : 0
    const failures = failMatch ? parseInt(failMatch[1], 10) : 0
    const allPassed = totalTests > 0 && failures === 0

    return { allPassed, totalTests, failures, rawOutput: output }
  }

  /** Whether the verification result allows phase transition. */
  assessPhaseTransition(result: VerificationResult, qualityGate: 'strict' | 'permissive'): boolean {
    if (qualityGate === 'strict') {
      return result.allPassed
    }
    // Permissive: allow if no failures and at least some tests ran
    return result.totalTests > 0 && result.failures === 0
  }
}
