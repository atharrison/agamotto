# Reshape a stored `agamotto.reviews` row into the control-review dump format.
# Findings from all three severity buckets are flattened into one array, which
# is what src/lib/control-scoring.ts reads.
#
#   psql "$DB" -At -c "$QUERY" | jq -f scripts/sql/dump-review.jq --argjson round N --arg notes "..."

(.result.blockingIssues // []) as $b
| (.result.suggestions // []) as $s
| (.result.nits // []) as $n
| {
    round: $round,
    id: .id,
    pr_url: .pr_url,
    mode: .mode,
    status: .status,
    created_at: .created_at,
    updated_at: .updated_at,
    verdict: .result.verdict,
    verdictSummary: .result.verdictSummary,
    summary: .result.summary,
    confidence: .result.confidence,
    whatLooksGood: .result.whatLooksGood,
    testingRecommendations: .result.testingRecommendations,
    questions: .result.questions,
    ticketAlignment: .result.ticketAlignment,
    fileCoverage: .result.fileCoverage,
    counts: {
      blocking: ($b | length),
      suggestions: ($s | length),
      nits: ($n | length),
      total: (($b | length) + ($s | length) + ($n | length))
    },
    findings: [
      ($b + $s + $n)[]
      | {
          severity,
          category,
          # ATH-50 multi-attribution. Absent on pre-ATH-50 runs; the scorer
          # falls back to [category] so old and new dumps stay comparable.
          categories,
          file,
          line,
          title,
          confidence,
          body,
          suggestedFix
        }
    ],
    notes: $notes
  }
