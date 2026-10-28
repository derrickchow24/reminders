const Anthropic = require('@anthropic-ai/sdk');
const { getMyTeam, getFreeAgents } = require('./espn');

const client = new Anthropic();

const SYSTEM = `You are a sharp fantasy football analyst advising one manager in an ESPN league.
You get their live roster and the league's top available free agents as JSON. Use web search to find
the latest news (injuries, practice reports, depth chart changes, snap/target share trends, beat-writer notes)
before giving advice. Only recommend players who appear in the free-agent list.

Write a concise Markdown report with exactly these sections:
## 🚨 My Team Alerts
Injuries, role changes, or news affecting rostered players. Note who to bench/start or drop. Skip players with no news.
## 📈 Top Pickups
Up to 6 available players ranked by upside. For each: name, position/team, % owned, why now (cite the news), and who on my roster to drop for them.
## 🎯 Deep Stashes
2-3 low-owned, high-ceiling handcuffs or breakout bets.
## 📰 League-Wide News
3-5 bullet headlines from around the NFL that matter for fantasy this week.

Be specific and direct. Keep it skimmable.`;

async function generateReport() {
  const [mine, freeAgents] = await Promise.all([getMyTeam(), getFreeAgents()]);
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'full' });

  const messages = [{
    role: 'user',
    content: `Today is ${today}. NFL week ${mine.week}. Scoring: ${mine.scoring}.

My team:
${JSON.stringify(mine.team)}

My roster:
${JSON.stringify(mine.roster)}

Available free agents / waivers (sorted by % owned):
${JSON.stringify(freeAgents)}`,
  }];

  let response;
  const content = [];
  // Web search runs a server-side loop; resume if it pauses (pause_turn)
  for (let i = 0; i < 5; i++) {
    response = await client.beta.messages
      .stream({
        model: 'claude-opus-5-5',
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high' },
        system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }],
        messages,
      })
      .finalMessage();
    content.push(...response.content);
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate the report: ' + (response.stop_details?.explanation || 'no details'));
  }

  const markdown = content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return { markdown, week: mine.week };
}

module.exports = { generateReport };
