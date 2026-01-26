/**
 * LLM Prompt Templates
 * Chain-of-thought prompts for semantic relationship detection
 */

export const SYSTEM_PROMPT = `You are an expert at analyzing prediction market questions to identify logical relationships and arbitrage opportunities.

Your task is to analyze pairs of market questions and determine if there is a logical dependency between them that creates probability constraints.

Types of relationships to identify:

1. SUBSET: Event A implies Event B (if A happens, B must happen)
   Example: "X wins primary" implies "X is nominated" - winning primary strongly implies getting nomination

2. SUPERSET: Event B implies Event A (if B happens, A must happen)
   Example: "X wins championship" implies "X makes playoffs" - must make playoffs to win championship

3. MUTUAL_EXCLUSION: A and B cannot both be true
   Example: "Team A wins" and "Team B wins" the same game

4. LOGICAL_BOUND: Probability constraints that must hold
   Example: P(X wins presidency) <= P(X wins nomination) - can't win presidency without nomination

5. NESTED_TARGET: Price/threshold targets where higher targets imply lower targets
   Example: "BTC reaches $150k" implies "BTC reaches $100k"

6. TEMPORAL: Time-based dependencies
   Example: "X happens by March" is implied by "X happens by January"

7. NONE: No logical relationship exists

Output your analysis in the following JSON format:
{
  "relationship_type": "subset" | "superset" | "mutual_exclusion" | "logical_bound" | "nested_target" | "temporal" | "none",
  "confidence": 0.0-1.0,
  "reasoning": "Step-by-step explanation of your analysis",
  "constraint": {
    "type": "probability_bound" | "sum_bound" | "exclusive" | null,
    "expression": "P(A) >= P(B)" or "P(A) + P(B) <= 1" or null,
    "market1_should_be": "higher" | "lower" | "equal" | null
  },
  "arbitrage_possible": true | false,
  "arbitrage_direction": {
    "buy": "market1" | "market2",
    "sell": "market1" | "market2"
  } | null
}

Be conservative - only identify relationships you are highly confident about.`;

export const USER_PROMPT_TEMPLATE = `Analyze these two prediction market questions for logical relationships:

**Market 1:**
Question: "{market1_question}"
Current YES Price: {market1_price}% (probability)

**Market 2:**
Question: "{market2_question}"
Current YES Price: {market2_price}% (probability)

Consider:
1. Are these about the same subject/entity?
2. Is there a logical implication between them?
3. Do the current prices violate any logical constraints?
4. If constraint is violated, which direction is the arbitrage?

Provide your analysis in the specified JSON format.`;

/**
 * Build user prompt from market data
 */
export function buildUserPrompt(
  market1Question: string,
  market1Price: number,
  market2Question: string,
  market2Price: number
): string {
  return USER_PROMPT_TEMPLATE
    .replace('{market1_question}', market1Question)
    .replace('{market1_price}', (market1Price * 100).toFixed(1))
    .replace('{market2_question}', market2Question)
    .replace('{market2_price}', (market2Price * 100).toFixed(1));
}

/**
 * Parsed LLM analysis response
 */
export interface LLMAnalysisResponse {
  relationship_type: string;
  confidence: number;
  reasoning: string;
  constraint: {
    type: string | null;
    expression: string | null;
    market1_should_be: 'higher' | 'lower' | 'equal' | null;
  } | null;
  arbitrage_possible: boolean;
  arbitrage_direction: {
    buy: 'market1' | 'market2';
    sell: 'market1' | 'market2';
  } | null;
}

/**
 * Parse LLM response JSON
 */
export function parseAnalysisResponse(response: string): LLMAnalysisResponse | null {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.relationship_type || typeof parsed.confidence !== 'number') {
      return null;
    }

    return parsed as LLMAnalysisResponse;
  } catch (err) {
    console.error('Failed to parse LLM response:', err);
    return null;
  }
}
