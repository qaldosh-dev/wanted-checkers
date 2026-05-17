export async function enrichWithGrok(analysis, replay) {
  if (!process.env.GROK_API_KEY) {
    return { ...analysis, provider: "local", grokEnabled: false };
  }

  try {
    const rewritten = await requestGrokExplanations(analysis, replay);
    return {
      ...analysis,
      provider: "local+grok",
      grokEnabled: true,
      summary: rewritten.summary ?? analysis.summary,
      insights: analysis.insights.map((insight) => ({
        ...insight,
        explanation: rewritten.explanations?.[insight.id] ?? insight.explanation
      }))
    };
  } catch {
    return {
      ...analysis,
      provider: "local",
      grokEnabled: false,
      grokFallback: true
    };
  }
}

async function requestGrokExplanations(analysis, replay) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GROK_MODEL ?? "grok-2-latest",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are the WANTED CHECKERS AI Coach. Rewrite local tactical findings into concise, vivid coaching language. Do not invent new analysis. Return JSON only."
        },
        {
          role: "user",
          content: JSON.stringify({
            match: {
              mode: replay.mode,
              result: replay.result,
              players: replay.players
            },
            requiredShape: {
              summary: "short overall coaching summary",
              explanations: { insightId: "one or two sentence coaching explanation" }
            },
            localFindings: analysis.insights.map((insight) => ({
              id: insight.id,
              moveNumber: insight.moveNumber,
              severity: insight.severity,
              type: insight.type,
              label: insight.label,
              tacticalLabel: insight.tacticalLabel,
              explanationSeed: insight.explanationSeed
            }))
          })
        }
      ]
    })
  });

  if (!response.ok) throw new Error("Grok coaching unavailable.");
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Grok coaching response was empty.");
  return JSON.parse(content);
}
