# ANGELA -- Pitch Playbook

## Target Tracks

| Track | Prize | Fit | Why |
|-------|-------|-----|-----|
| **Main Awards** | HKD 20K/10K/5K | PRIMARY | Hits all 5 criteria at full strength |
| **Ingram Micro & AWS Agentic AI** | HKD 10,000 | PRIMARY | Already on Bedrock, multi-agent = agentic AI, fintech is a named sector, HK financial hub |
| **HKUST EC Innovation** | HKD 10,000 | CONDITIONAL | Strong on all 4 criteria, requires 1 HKUST student on team |

---

## Judging Criteria -- Complete Map

### Main Awards (5 criteria, equally weighted)

| # | Criterion | What judges look for |
|---|-----------|---------------------|
| M1 | Novelty & Creativity | Is this something they haven't seen before? |
| M2 | Demonstrated Use of AI/ML Techniques | Multiple, clearly applied AI/ML methods |
| M3 | Impact & Relevance | Solves a real, large-scale problem |
| M4 | Technical Implementation & Scalability | Clean code, good architecture, could scale |
| M5 | Presentation & Communication | Clear demo, compelling story, easy to follow |

### Ingram Micro & AWS Agentic AI (3 criteria, RANKED tiebreaker: 1 > 2 > 3)

| # | Criterion | Priority | What judges look for |
|---|-----------|----------|---------------------|
| A1 | Business value & use case | TIEBREAKER #1 | Who pays for this? How much does it save? |
| A2 | Implementation quality with AWS AI services | TIEBREAKER #2 | How deeply and well is Bedrock integrated? |
| A3 | Innovation & originality | TIEBREAKER #3 | What's new here? |

**Requirement:** Must use AWS Bedrock AgentCore or Quick Suite.

### HKUST EC Innovation (4 criteria)

| # | Criterion | What judges look for |
|---|-----------|---------------------|
| H1 | Innovation & originality | Novel approach to a real problem |
| H2 | Entrepreneurial potential | Could this become a startup? |
| H3 | Technical execution | Is it well-built? |
| H4 | Real-world impact | Does it move the needle on something that matters? |

**Requirement:** At least one HKUST student on the team.

---

## Criteria Coverage Matrix

Every sentence in the pitch must justify its existence by serving multiple criteria simultaneously. Below: which ANGELA features map to which criteria, and how densely.

```
                        M1  M2  M3  M4  M5  A1  A2  A3  H1  H2  H3  H4
                        Nov AI  Imp Tec Pre Bus AWS Inn Inn Ent Tec Imp
                        ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
Problem: AML + HK        .   .   ##  .   #   ##  .   .   .   #   .   ##   (5)
3D spatial visualization ##  .   .   #   ##  .   .   ##  ##  .   .   .    (5)
Multi-agent on Bedrock   #   ##  .   #   .   .   ##  #   #   .   ##  .    (6)
14 AI/ML techniques      #   ##  .   .   .   .   .   #   #   .   #   .    (4)
3 risk detectors         .   ##  .   #   .   .   .   .   .   .   #   .    (3)
Counterfactual explainer ##  ##  #   .   .   #   .   ##  ##  .   .   #    (6)
SAR auto-generation      #   #   ##  .   .   ##  .   #   .   ##  .   ##   (6)
NLQ engine               #   #   #   .   .   #   .   .   .   .   .   .    (3)
Real-time WebSocket      .   .   .   ##  #   .   #   .   .   .   #   .    (3)
Production architecture  .   .   .   ##  .   .   ##  .   .   #   ##  .    (4)
Market size / HK TAM     .   .   ##  .   .   ##  .   .   .   ##  .   #    (4)
Autopilot camera tours   #   .   .   .   ##  .   .   #   #   .   .   .    (3)

## = primary hit    # = supporting hit    . = not relevant
(number) = total criteria served by that point
```

**Highest-density talking points (6 criteria each):**
1. Multi-agent agentic AI on Bedrock
2. Counterfactual explainer
3. SAR auto-generation

**These three points must get the most airtime.** They pull the hardest across all three tracks.

---

## Agentic AI -- The Core of the Pitch

This is an AI competition. Every team will say "we used AI." What separates ANGELA is that **the AI isn't a feature -- it's the investigator.** The system doesn't just assist a human workflow; it autonomously conducts investigations end-to-end. Below is every agentic capability, what it actually does from the user's perspective, and why it matters.

### What Makes It "Agentic" (Not Just "Uses LLMs")

Calling an LLM once is not agentic. ANGELA's system has:

- **Autonomous multi-step reasoning** -- 4 specialist agents that each make decisions, pass structured output forward, and build on each other's work
- **Memory and state** -- every investigation run is tracked with a unique ID, timestamped steps, artifacts per agent, status lifecycle (running → completed/failed)
- **Orchestration with a supervisor** -- the InvestigationSupervisor decides execution order, handles failures, manages caching, and broadcasts progress
- **Configurable autonomy** -- three depth profiles (fast/balanced/deep) let the system decide how many entities to analyze and how deeply to summarize
- **Real-time observability** -- every agent step streams progress via WebSocket as it happens, so the user watches the investigation unfold live

### Concrete Agentic Workflows

#### Workflow 1: Natural Language Investigation

An analyst types: **"Find structuring near threshold transactions"**

Here's what happens -- autonomously, no further human input:

```
USER INPUT
  │
  ▼
AGENT 1 - Intake Agent
  │  Parses "find structuring near threshold" via LLM
  │  Extracts: intent = STRUCTURING_NEAR_THRESHOLD, params = {}
  │  Generates interpretation: "Looking for entities with multiple
  │  transactions just below the $10,000 reporting threshold"
  │  → streams AGENT_STEP event to frontend
  ▼
AGENT 2 - Research Agent
  │  Takes the structured intent
  │  Queries the data store for entities with structuring evidence
  │  Finds entities where near_threshold_count >= 2
  │  Ranks them by risk score
  │  Builds a profile for each: risk data, transaction patterns,
  │  connected counterparties, jurisdiction info
  │  → streams AGENT_STEP event to frontend
  ▼
AGENT 3 - Analysis Agent
  │  Receives the ranked entity profiles
  │  For the top N entities (1 in fast, 3 in balanced, 5 in deep):
  │    - Gathers risk evidence, activity summary, neighbor context
  │    - Calls LLM via Bedrock to generate a plain-English summary:
  │      "Entity E042 executed 7 transactions between $9,100 and
  │       $9,950 within a single time window, consistent with
  │       deliberate structuring to avoid the $10,000 threshold.
  │       Connected to 3 entities in jurisdiction 5."
  │  → streams AGENT_STEP event to frontend
  ▼
AGENT 4 - Reporting Agent
  │  Compiles everything into an investigator briefing:
  │    - Original query interpretation
  │    - Ranked entity list with risk scores
  │    - AI-generated summaries for top targets
  │    - Evidence breakdown per entity
  │    - (Optional) Full SAR narrative for the highest-risk entity
  │  → streams AGENT_RUN_COMPLETED to frontend
  ▼
FRONTEND
  Highlights the flagged entities in the 3D graph
  Opens the investigation briefing panel
  Analyst can click any entity to dive deeper
```

**The analyst typed one sentence. Four agents did the rest.** That's agentic.

#### Workflow 2: One-Click SAR Generation

An analyst clicks "Generate SAR" on entity E042.

The system autonomously:
1. Pulls the entity's risk profile (score, reasons, evidence)
2. Pulls the entity's activity summary (in/out counts, volumes)
3. Identifies connected entities (up to 10 counterparties) and their risk scores
4. Assembles a structured payload: entity type, bank, jurisdiction, risk score, all reasons, all evidence, activity data, connected entity profiles, time bucket, bucket duration
5. Feeds the payload to the Reporting Agent with a SAR-specific system prompt
6. Generates a multi-paragraph regulatory narrative covering: subject identification, suspicious activity description, transaction patterns, risk indicators, and recommended action
7. Caches the result (thread-safe) so repeated requests are instant

**Output:** A complete Suspicious Activity Report narrative that would normally take an analyst 4-8 hours to write.

#### Workflow 3: NLQ Graph Query

An analyst types: **"Show me circular flow and layering activity"**

1. The NLQ engine sends the query to the LLM with a system prompt defining 6 possible intents
2. LLM returns: `intent = CIRCULAR_FLOW, params = {}`
3. The executor queries all entities where `circular_flow.cycle_count >= 1`
4. Collects all cycle counterparties into the result set
5. Finds all edges between the matched entities
6. Returns entity IDs, edges, and a summary: "12 entities involved in circular flows"
7. The 3D graph highlights those entities and edges, dimming everything else

**Six supported intents:**
- `SHOW_HIGH_RISK` -- "show suspicious entities" → filters by risk threshold
- `LARGE_INCOMING` -- "big incoming transfers" → filters by incoming volume
- `HIGH_RISK_JURISDICTION` -- "risky entities in jurisdiction 3" → filters by jurisdiction + risk
- `STRUCTURING_NEAR_THRESHOLD` -- "structuring patterns" → filters by near-threshold evidence
- `CIRCULAR_FLOW` -- "circular flows" → filters by cycle detection evidence
- `TOP_CLUSTERS` -- "top risk clusters" → runs cluster detection and returns top N

#### Workflow 4: Autonomous Counterfactual Analysis

An analyst clicks "What If?" on a flagged entity.

The system autonomously:
1. Examines the entity's risk evidence to decide which edges are suspicious
2. For structuring evidence: identifies transactions in the $9K-$10K range
3. For circular flow evidence: identifies edges to/from cycle counterparties
4. For velocity evidence: identifies transactions less than 2 minutes apart
5. Removes all identified suspicious edges from a temporary copy of the data
6. Reruns the full risk pipeline (feature extraction → 3 detectors → fusion) on the cleaned data
7. Returns: original risk score, counterfactual risk score, the delta, and every removed edge with its reason

**The system decided what to remove, why to remove it, and what the world would look like without it.** That's explainable, autonomous reasoning.

#### Workflow 5: Proactive Investigation Targeting

When data is loaded or anomalies are injected, the system proactively:
1. Identifies the highest-risk entities across the current time bucket
2. Detects clusters of connected high-risk entities
3. Generates investigation targets with labels and reasons
4. The Autopilot camera system can fly through these targets automatically
5. AI cache warmup proactively pre-generates summaries for top entities

**Nobody asked it to do this.** The system anticipates what the analyst will need next.

#### Workflow 6: Entity Click → AI Summary

An analyst clicks any entity in the 3D graph.

The system:
1. Fetches the entity's full detail (type, bank, jurisdiction, KYC level)
2. Fetches bucket-specific risk data (score, reasons with weights, evidence from each detector)
3. Fetches activity summary (in/out transaction counts and sums)
4. Sends all of this to the LLM via Bedrock with an AML-analyst system prompt
5. Returns a plain-English summary explaining the entity's risk in context
6. Result is LRU-cached (256 entries) so repeated clicks are instant

### Why This Matters for the AWS Agentic AI Track

The track asks for "AI agents that solve real Hong Kong problems." ANGELA's agentic system:

- **Uses AWS Bedrock** as the LLM backbone (native boto3 integration via Converse API, plus OpenAI-compatible endpoint support)
- **Is genuinely agentic** -- multi-agent orchestration with supervisor, memory, autonomy, and real-time observability. Not just "we wrapped an LLM call."
- **Solves a Hong Kong fintech problem** -- AML compliance in Asia's #3 financial center
- **Has concrete business value** -- SAR automation alone saves thousands of analyst-hours per year across HK's banking sector

---

## Complete Ranked Talking Points

Ranked by **criteria density** -- how many judging criteria each point addresses. Annotations show exactly which criteria are served.

### Rank 1 -- Agentic investigation with concrete walkthrough (7 criteria)

Don't say "we have a multi-agent system." Walk through what happens: "An analyst types 'find structuring patterns.' Agent one parses the intent. Agent two queries the data store and ranks entities. Agent three generates AI summaries for the top targets via Bedrock. Agent four compiles an investigator briefing. The analyst typed one sentence. Four agents did the rest."

Criteria: M1 (novel), M2 (multi-agent LLM orchestration), M4 (supervisor pattern), M5 (compelling walkthrough), A2 (Bedrock), A3 (agentic investigation is new for AML), H3 (well-implemented)

### Rank 2 -- SAR generation: the money feature (6 criteria)

One click generates a Suspicious Activity Report narrative. The system autonomously gathers risk evidence, connected entities, transaction patterns, and writes a multi-paragraph regulatory document. Hong Kong's JFIU processes 100,000+ STRs annually. Each takes analysts 4-8 hours. ANGELA drafts them in seconds.

Criteria: M1 (creative application), M2 (LLM narrative generation), M3 (direct regulatory impact), A1 (massive time savings = business value), H2 (clear revenue path), H4 (real analyst hours saved)

### Rank 3 -- Counterfactual explainer (6 criteria)

The system autonomously decides which edges are suspicious (structuring? cycle? velocity?), removes them, reruns the full risk pipeline, and shows the delta. It answers "what if this entity behaved normally?" -- autonomous reasoning about its own risk assessments.

Criteria: M1 (novel concept), M2 (counterfactual analysis technique), M3 (regulatory explainability), A1 (compliance value), A3 (original), H1 (innovative)

### Rank 4 -- Problem statement: AML + Hong Kong (5 criteria)

$800B-$2T laundered annually. Traditional tools: spreadsheets, flat dashboards, 95%+ false positive rates. Hong Kong = #3 global financial center, $5T+ cross-border flows, HKMA regulatory pressure. Fintech is an explicitly named sector in the AWS track.

Criteria: M3 (massive real-world problem), M5 (hooks the audience), A1 (huge addressable market), H2 (entrepreneurial TAM), H4 (critical problem)

### Rank 5 -- 3D spatial graph visualization (5 criteria)

Entities exist in 3D space. Y-axis = risk score (suspicious entities rise). X-axis = jurisdiction lanes. Z-axis = KYC level. Node size = volume, glow = risk, color = jurisdiction. Nobody in AML has this. Competitors (Actimize, Featurespace, Feedzai) all use 2D tables and dashboards.

Criteria: M1 (genuinely novel), M4 (GPU instancing, Three.js architecture), M5 (visually spectacular demo), A3 (original), H1 (innovative)

### Rank 6 -- NLQ: talk to your data (4 criteria)

Six supported query types, all in plain English. "Show me high risk entities" → LLM parses intent → deterministic execution against the data store → entities highlighted in 3D. No SQL. No filters. No training. Just ask.

Criteria: M2 (NLQ is AI/ML), M1 (creative UX), A1 (user productivity), A3 (natural language interface for AML)

### Rank 7 -- 14 distinct AI/ML techniques (4 criteria)

Count them: (1) multi-agent orchestration, (2) LLM intent extraction, (3) LLM entity summarization, (4) LLM SAR generation, (5) LLM cluster summarization, (6) statistical velocity detection vs population percentiles, (7) rule-based structuring detection ($9K-$10K threshold), (8) DFS cycle detection, (9) BFS k-hop expansion, (10) weighted score fusion, (11) feature extraction pipeline, (12) connected-component clustering, (13) counterfactual edge-removal analysis, (14) composite-key LRU caching with invalidation.

Criteria: M2 (this IS the criterion), A3 (breadth is impressive), H1 (technical depth), H3 (execution quality)

### Rank 8 -- Production architecture (4 criteria)

Typed full-stack (Pydantic + TypeScript). Dual AI providers with env-var switching. Docker multi-stage builds. WebSocket real-time event broadcasting. LRU caching. Graceful error handling and retry logic. 25+ API endpoints. Modular separation of risk engine, agent system, NLQ, visualization.

Criteria: M4 (this IS the criterion), A2 (AWS integration is production-grade), H3 (execution quality), H2 (deployment-ready = closer to product)

### Rank 9 -- Market size and business case (4 criteria)

Global AML compliance spending: $274B annually. Banks pay $50K-$500K per compliance analyst seat. Clear SaaS pricing model. Start with HK banks, expand APAC, then global. Competitive moat: no competitor offers 3D spatial investigation + agentic AI.

Criteria: M3 (relevance), A1 (business value), H2 (entrepreneurial potential), H4 (impact)

### Rank 10 -- Real-time agent observability (3 criteria)

Every agent step streams progress via WebSocket as it runs. The frontend shows: "Intake Agent: parsing query... Research Agent: resolving entities... Analysis Agent: generating summary for E042..." The investigation unfolds live on screen.

Criteria: M4 (architectural quality), M5 (demo impact), A2 (production-grade agentic system)

### Rank 11 -- Three independent risk detectors (3 criteria)

Velocity: statistical outlier vs population p50/p95. Structuring: $9,000-$10,000 BSA threshold evasion detection. Circular flow: DFS-based cycle detection (3-4 node loops). Fused with explicit weights (0.4/0.3/0.3).

Criteria: M2 (clear AI/ML), M4 (clean engineering), H3 (well-built)

### Rank 12 -- Proactive warmup and investigation targeting (3 criteria)

When data loads, the system proactively identifies highest-risk entities, detects clusters, pre-warms AI caches for top entities and SAR narratives. Nobody asked it to. The Autopilot camera flies through these targets automatically.

Criteria: M1 (creative), M5 (self-presenting demo), A3 (proactive agent behavior)

### Rank 13 -- Configurable depth profiles (2 criteria)

fast = 1 LLM summary, minimal latency. balanced = 3 summaries, default depth. deep = 5 summaries, maximum thoroughness. The system decides which entities deserve the deepest analysis based on risk ranking.

Criteria: A2 (production-ready agent design), A3 (autonomy in resource allocation)

### Rank 14 -- Time-bucketed temporal analysis (2 criteria)

Transactions grouped into time windows. Slider scrubs through time. Watch risk evolve, clusters form and dissolve.

Criteria: M2 (temporal analysis), M4 (technical execution)

### Rank 15 -- Data compatibility (2 criteria)

IBM AML dataset format, arbitrary CSV with column mapping, JSON snapshots. Works on real transaction data, not toy demos.

Criteria: M4 (practical engineering), A1 (enterprise-ready)

### Rank 16 -- Executive dashboard (2 criteria)

KPIs: high-risk count, new anomalies, cluster count, cross-border ratio. Risk trend across all buckets. Jurisdiction heatmap.

Criteria: M5 (clear communication of risk posture), A1 (executive decision support)

### Rank 17 -- Anomaly injection (1 criterion, but critical for demo)

Inject velocity bursts, structuring patterns, or circular flows on demand. Watch the 3D graph react in real time. Best demo trick available.

Criteria: M5 (presentation impact)

---

## The 1.5-Minute Elevator Pitch (wyli)

**Instructions:** Have the 3D visualization visible on screen while delivering. Speak at moderate pace (~2.5 words/second). Target: ~230 words. The agentic AI walkthrough is the centerpiece -- deliver it like you're telling a story, not reading a spec sheet.

Each line is annotated with the criteria it addresses.

---

> Every year, two trillion dollars is laundered through the global financial system. Hong Kong -- one of the world's top three financial centers -- processes trillions in cross-border flows, making it ground zero for this fight. The analysts protecting the system? Spreadsheets. Ninety-five percent false positive rates. SARs that take hours to write.

**[M3: Impact, M5: Hook, A1: Business Value, H2: Entrepreneurial, H4: Real-world Impact]**

> ANGELA is an AI-powered 3D graph intelligence platform for AML investigation. What you see isn't a dashboard -- it's a spatial intelligence environment where suspicious entities physically rise by risk, jurisdictions map to lanes, and clusters glow in real time.

**[M1: Novelty, M5: Presentation, A3: Innovation, H1: Innovation]**

> Here's what makes it agentic. An analyst types one question -- "find structuring patterns near the reporting threshold." From that single sentence, four AI agents running on AWS Bedrock take over. The Intake Agent parses the intent. The Research Agent queries the data store, finds entities with transactions just below ten thousand dollars, and ranks them by risk. The Analysis Agent generates plain-English summaries explaining why each entity is suspicious. The Reporting Agent compiles a full investigator briefing -- and if needed, drafts a complete Suspicious Activity Report automatically. The analyst typed one sentence. Four agents did the rest.

**[M2: AI/ML, M4: Tech, A1: Business Value, A2: AWS Implementation, A3: Innovation, H3: Tech Execution]**

> Every risk score is decomposable -- three detectors, explicit weights, full evidence chains. A counterfactual engine autonomously removes suspicious edges and recomputes: "what would the risk be without this behavior?"

**[M1: Novelty, M2: AI/ML, A1: Business Value, H1: Innovation]**

> Hong Kong files over a hundred thousand suspicious transaction reports a year. Each takes analysts hours. Our agents draft them in seconds. That's not a demo feature -- that's thousands of analyst-hours returned to actual investigation.

**[M3: Impact, A1: Business Value, H2: Entrepreneurial, H4: Impact]**

> GPU-instanced 3D rendering, real-time WebSocket, typed full-stack, Docker-ready, native Bedrock integration. Built to ship.

**[M4: Tech & Scalability, A2: AWS Quality, H3: Tech Execution]**

> ANGELA gives compliance analysts an AI investigator that sees the network, understands the patterns, and explains its reasoning.

**[M5: Memorable close, A3: Agentic framing]**

---

**Word count:** ~250. **Delivery time:** ~1:35 at moderate pace. Trim the architecture line if running long.

### Criteria Coverage Verification

| Criterion | Addressed In | Times Hit |
|-----------|-------------|-----------|
| M1 Novelty & Creativity | 3D spatial viz, counterfactual, agentic investigation | 3 |
| M2 AI/ML Techniques | 4-agent pipeline walkthrough, 3 detectors, counterfactual | 3 |
| M3 Impact & Relevance | $2T problem, 95% false positives, SAR volume, HK context | 3 |
| M4 Tech Implementation | Architecture stack, supervisor pattern, GPU instancing | 2 |
| M5 Presentation | Opening hook, 3D visual, agentic story, memorable close | 4 |
| A1 Business Value (TIEBREAKER #1) | $2T problem, analyst pain, agent walkthrough, SAR automation, counterfactual compliance | 5 |
| A2 AWS Implementation (TIEBREAKER #2) | "four AI agents running on AWS Bedrock", "native Bedrock integration" | 2 |
| A3 Innovation | 3D viz, agentic investigation walkthrough, close framing | 3 |
| H1 Innovation | 3D visualization, counterfactual | 2 |
| H2 Entrepreneurial | Analyst pain point, SAR automation = thousands of hours | 2 |
| H3 Tech Execution | Agent pipeline, architecture stack | 2 |
| H4 Real-world Impact | HK STR volume, analyst hours saved | 2 |

**All 12 criteria hit. A1 (Business Value) now hit 5 times -- it's the #1 AWS tiebreaker and the agentic walkthrough directly demonstrates it.**

### What changed vs. the old pitch

The old pitch spent one sentence on agents ("a four-agent system...delivers an investigator briefing"). The new pitch walks through the full pipeline step by step -- Intake parses intent, Research queries and ranks, Analysis summarizes via Bedrock, Reporting compiles the briefing and drafts SARs. This is the difference between "we have AI" and "here's what our AI actually does, autonomously, from a single sentence of input."

---

## 3-Minute Final Round Expansion (cedric)

Same structure as the elevator pitch, but now you have time to SHOW the agentic system live and go deeper on every beat.

### After the problem statement -- add market context:

> Global AML compliance spending exceeds two hundred seventy-four billion dollars a year. Banks spend more on compliance than they lose to fraud. Yet the technology hasn't changed in a decade. ANGELA is built for this gap.

**[A1: Business Value, H2: Entrepreneurial (TAM)]**

### After the 3D visualization -- live demo: inject anomaly

> Let me show you. I'll inject a structuring pattern -- ten transactions just below the ten-thousand-dollar reporting threshold. Watch the entity rise in the graph. The risk score updates in real time via WebSocket. The cluster forms. A beacon appears.

**[M5: Presentation, M1: Novelty (live reaction), A1: Business Value (demo of detection)]**

### After the agent walkthrough -- live demo: run an investigation

> Let me trigger an investigation right now. I'll type "find structuring patterns." Watch the bottom panel -- you can see each agent step streaming in real time. Intake Agent: parsing query. Research Agent: resolving entities. Analysis Agent: generating summary for the top entity. Reporting Agent: compiling briefing. There -- full investigator briefing, generated autonomously from one sentence.

**[M2: AI/ML, A2: AWS (live Bedrock calls), M5: Presentation (most impressive demo moment)]**

### After the investigation demo -- show the SAR

> Now I'll click "Generate SAR" on this flagged entity. The agent gathers risk evidence, transaction patterns, connected entities, and writes a complete Suspicious Activity Report narrative. This document normally takes compliance analysts four to eight hours. Our agents produce it in seconds.

**[A1: Business Value, M3: Impact, H2: Entrepreneurial]**

### Show the counterfactual

> And here's what no other AML tool does. I click "What If?" -- the system autonomously identifies which transactions are suspicious, removes them, reruns the entire risk pipeline, and shows me the delta. This entity's risk drops from 0.82 to 0.15 without the structuring transactions. That's not a black box -- that's explainable AI a regulator can trust.

**[M1: Novelty, M2: AI/ML, A1: Business Value (compliance)]**

### Technical depth -- risk pipeline:

> Under the risk engine: three independent detectors. Velocity compares transaction frequency to population percentiles. Structuring detects amounts in the nine-to-ten-thousand-dollar range. Circular flow uses depth-first search to find three-to-four-node layering loops. Fused with explicit weights: forty, thirty, thirty. Fourteen distinct AI and ML techniques total.

**[M2: AI/ML (depth), M4: Tech (pipeline quality)]**

### Competitive landscape:

> The market leaders -- NICE Actimize, Featurespace, Feedzai -- all use two-dimensional rule-based dashboards. None offer 3D spatial investigation. None have agentic multi-agent analysis. None generate SARs from natural language. None provide counterfactual explainability. ANGELA is a different category of tool.

**[M1: Novelty (vs competition), A1: Business Value (differentiation), H2: Entrepreneurial (moat)]**

### Close with path forward:

> Next steps: pilot with a Hong Kong compliance team, validate on production volumes, and build toward a SaaS platform. The architecture is Docker-ready, Bedrock-native, and provider-agnostic. The tech is real, the market is massive, and the problem isn't going away.

**[H2: Entrepreneurial, M4: Scalability, A1: Business Value, M5: Confident close]**

---

## Q&A Preparation

### Questions Main Awards judges will ask:

**"How is this different from existing AML tools?"**
> Existing tools -- Actimize, Featurespace, SAS -- use 2D dashboards, flat rule engines, and manual investigation workflows. ANGELA introduces three fundamental differences: 3D spatial intelligence that encodes risk, jurisdiction, and KYC into physical space; a multi-agent agentic investigation system that takes natural language and produces investigator briefings; and a counterfactual explainer that shows not just what the risk is, but why and how it would change. No current commercial product combines these.

**"Can you explain the risk scoring in more detail?"**
> Three independent detectors. Velocity compares transaction count to population percentiles -- the median and 95th -- so scoring adapts to the dataset. Structuring counts transactions in the nine-to-ten-thousand dollar range, just below the BSA reporting threshold. Circular flow runs depth-limited DFS to find 3-to-4-node cycles. Each produces a zero-to-one score. We fuse them: velocity at 40%, structuring 30%, circular flow 30%. The weights are explicit, auditable, and adjustable. Regulators can see exactly which signal drove the score.

**"How would this scale to a real bank?"**
> The current architecture uses an in-memory data store for hackathon speed. For production: the data layer swaps to a graph database or time-series store, the risk pipeline parallelizes per-entity, and the frontend already uses GPU instancing -- it renders thousands of nodes at 60fps. The AI layer is Bedrock-native and horizontally scalable. Docker images are ready. The path from demo to deployment is infrastructure, not architecture redesign.

**"What's the false positive rate?"**
> Traditional systems flag everything above a static threshold -- that's where the 95% false positive rate comes from. ANGELA's risk fusion is multi-signal: an entity needs elevated velocity AND structuring AND circular flow to score high. The counterfactual layer lets analysts immediately verify whether flagged behavior is the actual driver. We haven't benchmarked on labeled production data yet, but the architecture is designed to reduce false positives by fusing orthogonal signals rather than relying on a single rule.

### Questions AWS/Ingram Micro judges will ask:

**"How specifically are you using Bedrock?"**
> Bedrock is the backbone of every agentic capability. The AI service layer integrates natively via boto3's bedrock-runtime Converse API. Every LLM call in the system routes through Bedrock: the Intake Agent's intent parsing, the Analysis Agent's entity summarization, the Reporting Agent's SAR narrative generation, the NLQ engine's query parsing, and the cluster summarization. That's five distinct agentic use cases on a single Bedrock integration. We also support an OpenAI-compatible fallback -- switching providers is a single environment variable -- but Bedrock is the primary production path. The architecture includes retry logic with increased token budgets for reasoning models, graceful fallback on errors, and LRU caching to minimize redundant calls.

**"Who would buy this and how would you monetize?"**
> Primary buyers: compliance departments at Hong Kong banks and financial institutions. The HKMA requires AML programs -- banks already have compliance budgets. ANGELA sells as a SaaS platform, priced per analyst seat. The SAR automation alone justifies the cost: a compliance analyst costs $50-100K USD annually, and they spend a significant portion of their time writing SARs. If ANGELA saves even 20% of that time, the ROI is immediate. Secondary market: regulators who want a real-time view across institutions.

**"Why is this a Hong Kong problem?"**
> Hong Kong is the gateway between mainland China and global financial markets. Cross-border flows exceed five trillion dollars annually. The JFIU processes over a hundred thousand suspicious transaction reports per year. HKMA has intensified AML enforcement -- banks have been fined millions. Hong Kong compliance teams need tools purpose-built for cross-jurisdictional analysis. ANGELA's jurisdiction-lane visualization and cross-border risk ratio KPI were designed specifically for this topology.

### Questions HKUST EC judges will ask:

**"What's your go-to-market strategy?"**
> Phase 1: Partner with one Hong Kong bank's compliance team for a pilot -- we already handle real transaction data formats. Phase 2: Iterate based on analyst feedback, add integration with existing case management systems. Phase 3: Launch as a SaaS product targeting mid-tier Hong Kong banks. Phase 4: Expand to APAC financial centers -- Singapore, Tokyo, Sydney. The architecture is Docker-ready and provider-agnostic, so deployment across institutions is fast.

**"What's the TAM?"**
> Global AML compliance spending is $274 billion annually. The AML software market specifically is $3.5 billion and growing at 15% CAGR. In Hong Kong alone, the top 20 banks each spend tens of millions on compliance technology. Even capturing a fraction of one institution's compliance tech budget would be a viable business.

**"What's next after the hackathon?"**
> Three priorities. First, benchmark on labeled AML datasets to quantify false positive reduction. Second, integrate with real banking infrastructure -- case management APIs, SWIFT message parsing, and KYC databases. Third, explore patent protection for the 3D spatial encoding scheme and the counterfactual risk analysis method. The tech is real, the market is massive, and the timing is right given increasing regulatory pressure globally.

---

## Demo Strategy

### For the elevator pitch (1.5 min): Static visual

Have the 3D graph loaded and slowly orbiting on screen. Don't interact with it -- just let it be visually present while you speak. The judges' eyes will go to the screen. That visual impression does more for M1 (Novelty) and M5 (Presentation) than any words can.

### For the final round (3 min): Live demo sequence

| Time | Action | What judges see | Criteria |
|------|--------|----------------|----------|
| 0:00-0:20 | Problem + market context | Speaker over static 3D graph | M3, M5, A1, H4 |
| 0:20-0:40 | Walk the 3D viz: rotate, explain spatial encoding | Risk=height, jurisdiction=lanes, clusters glowing | M1, M5, A3, H1 |
| 0:40-1:00 | **LIVE: Inject structuring anomaly** | Entity rises, cluster forms, beacon appears | M1, M2, M5 |
| 1:00-1:40 | **LIVE: Type NLQ "find structuring patterns"** | Agent steps stream in real time on screen | M2, A2, A3, H3 |
| 1:40-2:00 | **LIVE: Show investigation briefing** | Ranked entities, AI summaries, evidence | M2, M5, A1 |
| 2:00-2:20 | **LIVE: Generate SAR on top entity** | Full narrative appears in panel | M3, A1, H2, H4 |
| 2:20-2:35 | **LIVE: Click "What If?" counterfactual** | Risk drops from 0.82 → 0.15, removed edges shown | M1, M2, A1 |
| 2:35-2:50 | Technical depth: 14 techniques, 3 detectors, Bedrock | Architecture summary | M2, M4, A2, H3 |
| 2:50-3:00 | Close: competitive moat, path forward | Confident ending | A1, H2, M5 |

### The two money demo moments

**Money moment #1: Type one sentence, watch four agents work.** Type "find structuring patterns." The WebSocket streams each agent step live: Intake parsing... Research resolving... Analysis summarizing... Reporting compiling. The briefing appears. This is 30 seconds that proves the system is genuinely agentic. **Practice this until the timing is natural.**

**Money moment #2: Inject anomaly, watch the graph react.** An entity glows, rises, a cluster forms, a beacon appears. This is 10 seconds of visual proof that risk detection, fusion, clustering, WebSocket streaming, and 3D rendering all work end-to-end.

Together, these two moments demonstrate: agentic AI + real-time system + spatial intelligence. That's the whole product in 40 seconds of live interaction.

---

## One-Page Cheat Sheet

Tape this to the back of your laptop during the pitch:

```
OPEN:    $2T laundered / HK = #3 financial center / 95% false positives / SARs take hours
SHOW:    3D graph -- risk=height, jurisdiction=lanes -- "this isn't a dashboard"
AGENTS:  "analyst types one sentence, four agents do the rest"
         Intake → parses intent
         Research → queries data, ranks entities
         Analysis → LLM summaries via Bedrock ("E042: 7 transactions below $10K...")
         Reporting → full briefing + SAR narrative
EXPLAIN: counterfactual -- remove suspicious edges, recompute, show delta
VALUE:   SAR automation / 100K+ STRs in HK / hours → seconds / thousands of analyst-hours
TECH:    14 AI/ML techniques / GPU instancing / WebSocket / Docker / Bedrock native
CLOSE:   "an AI investigator that sees the network, understands patterns, explains reasoning"
```
