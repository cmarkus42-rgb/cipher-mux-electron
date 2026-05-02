#!/bin/bash
# Mock Claude CLI for testing Cyber Factory worker spawning.
# Environment variables:
#   MOCK_MODEL   — simulated model (default: claude-sonnet-4-6)
#   MOCK_DELAY   — seconds to sleep simulating work
#   MOCK_EXIT_CODE — exit code (default: 0)

echo "Claude Code CLI (mock)"
echo "Model: ${MOCK_MODEL:-claude-sonnet-4-6}"
echo ""

# Read input
if [ -n "$1" ]; then
  INPUT="$1"
else
  read -r INPUT 2>/dev/null || INPUT="no input"
fi

echo "Received task: $INPUT"
echo ""
echo "## Plan"
echo "1. Analyze requirements"
echo "2. Implement solution"
echo "3. Write tests"
echo ""
echo "## Implementation"
echo "// Mock implementation complete"
echo ""
echo "## Tests"
echo "All tests pass."

if [ -n "$MOCK_DELAY" ]; then
  sleep "$MOCK_DELAY"
fi

exit ${MOCK_EXIT_CODE:-0}
