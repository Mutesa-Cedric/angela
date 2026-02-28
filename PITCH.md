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

## Complete Ranked Talking Points

Ranked by **criteria density** -- how many judging criteria each point addresses. Annotations show exactly which criteria are served.

### Rank 1 -- Multi-agent investigation on AWS Bedrock (6 criteria)

A 4-agent supervisor pipeline (Intake, Research, Analysis, Reporting) that takes plain English and autonomously investigates. Runs on AWS Bedrock. This IS agentic AI -- agents with memory, orchestration, configurable depth profiles (fast/balanced/deep), real-time progress streaming.

Criteria: M1 (novel architecture), M2 (multi-agent LLM orchestration), M4 (supervisor pattern, typed schemas), A2 (Bedrock native via boto3), A3 (agentic investigation is new for AML), H3 (well-implemented)

### Rank 2 -- Counterfactual explainer (6 criteria)

Answers "what if this entity behaved normally?" Removes suspicious edges (structuring, cycle, velocity), recomputes risk on cleaned data, returns the delta. No other AML tool does this.

Criteria: M1 (novel concept), M2 (counterfactual analysis technique), M3 (regulatory demand for explainability), A1 (explainability = compliance value), A3 (original), H1 (innovative)

### Rank 3 -- Automated SAR generation (6 criteria)

One click generates a Suspicious Activity Report narrative -- the exact regulatory document analysts spend 4-8 hours writing. Hong Kong's JFIU processes 100,000+ STRs annually. ANGELA drafts them in seconds from risk evidence, connected entities, and transaction patterns.

Criteria: M1 (creative application), M2 (LLM narrative generation), M3 (direct regulatory impact), A1 (massive time savings = business value), H2 (clear revenue path), H4 (real analyst hours saved)

### Rank 4 -- Problem statement: AML + Hong Kong (5 criteria)

$800B-$2T laundered annually. Traditional tools: spreadsheets, flat dashboards, 95%+ false positive rates. Hong Kong = #3 global financial center, $5T+ cross-border flows, HKMA regulatory pressure. Fintech is an explicitly named sector in the AWS track.

Criteria: M3 (massive real-world problem), M5 (hooks the audience), A1 (huge addressable market), H2 (entrepreneurial TAM), H4 (critical problem)

### Rank 5 -- 3D spatial graph visualization (5 criteria)

Entities exist in 3D space. Y-axis = risk score (suspicious entities rise). X-axis = jurisdiction lanes. Z-axis = KYC level. Node size = volume, glow = risk, color = jurisdiction. Nobody in AML has this. Competitors (Actimize, Featurespace, Feedzai) all use 2D tables and dashboards.

Criteria: M1 (genuinely novel), M4 (GPU instancing, Three.js architecture), M5 (visually spectacular demo), A3 (original), H1 (innovative)

### Rank 6 -- 14 distinct AI/ML techniques (4 criteria)

Count them: (1) multi-agent orchestration, (2) LLM intent extraction, (3) LLM entity summarization, (4) LLM SAR generation, (5) LLM cluster summarization, (6) statistical velocity detection vs population percentiles, (7) rule-based structuring detection ($9K-$10K threshold), (8) DFS cycle detection, (9) BFS k-hop expansion, (10) weighted score fusion, (11) feature extraction pipeline, (12) connected-component clustering, (13) counterfactual edge-removal analysis, (14) composite-key LRU caching with invalidation.

Criteria: M2 (this IS the criterion), A3 (breadth is impressive), H1 (technical depth), H3 (execution quality)

### Rank 7 -- Production architecture (4 criteria)

Typed full-stack (Pydantic + TypeScript). Dual AI providers with env-var switching. Docker multi-stage builds. WebSocket real-time event broadcasting. LRU caching. Graceful error handling and retry logic. 25+ API endpoints. Modular separation of risk engine, agent system, NLQ, visualization.

Criteria: M4 (this IS the criterion), A2 (AWS integration is production-grade), H3 (execution quality), H2 (deployment-ready = closer to product)

### Rank 8 -- Market size and business case (4 criteria)

Global AML compliance spending: $274B annually. Banks pay $50K-$500K per compliance analyst seat. Clear SaaS pricing model. Start with HK banks, expand APAC, then global. Competitive moat: no competitor offers 3D spatial investigation + agentic AI.

Criteria: M3 (relevance), A1 (business value), H2 (entrepreneurial potential), H4 (impact)

### Rank 9 -- Three independent risk detectors (3 criteria)

Velocity: statistical outlier vs population p50/p95. Structuring: $9,000-$10,000 BSA threshold evasion detection. Circular flow: DFS-based cycle detection (3-4 node loops). Fused with explicit weights (0.4/0.3/0.3).

Criteria: M2 (clear AI/ML), M4 (clean engineering), H3 (well-built)

### Rank 10 -- Real-time WebSocket architecture (3 criteria)

Risk changes, cluster detection, agent step progress all stream live. Anomaly injection triggers visible updates: nodes glow, clusters form, beacons appear. Connection manager with dead-connection pruning.

Criteria: M4 (architectural quality), M5 (demo impact), H3 (execution)

### Rank 11 -- NLQ engine (3 criteria)

6 intents: high risk, large incoming, jurisdiction, structuring, circular flow, top clusters. LLM parses → deterministic execution → entity IDs + edges + summary. Investigators don't write queries.

Criteria: M2 (NLQ is AI/ML), M1 (creative UX), A1 (user productivity)

### Rank 12 -- Autopilot camera tours (3 criteria)

Automated camera flies through highest-risk entities and clusters. Guided investigation without manual navigation. Self-presenting demo.

Criteria: M1 (creative), M5 (the demo runs itself), H1 (novel)

### Rank 13 -- Time-bucketed temporal analysis (2 criteria)

Transactions grouped into time windows. Slider scrubs through time. Watch risk evolve, clusters form and dissolve.

Criteria: M2 (temporal analysis), M4 (technical execution)

### Rank 14 -- Data compatibility (2 criteria)

IBM AML dataset format, arbitrary CSV with column mapping, JSON snapshots. Works on real transaction data, not toy demos.

Criteria: M4 (practical engineering), A1 (enterprise-ready)

### Rank 15 -- Executive dashboard (2 criteria)

KPIs: high-risk count, new anomalies, cluster count, cross-border ratio. Risk trend across all buckets. Jurisdiction heatmap.

Criteria: M5 (clear communication of risk posture), A1 (executive decision support)

### Rank 16 -- Anomaly injection (1 criterion, but critical for demo)

Inject velocity bursts, structuring patterns, or circular flows on demand. Watch the 3D graph react in real time. Best demo trick available.

Criteria: M5 (presentation impact)

---

## The 1.5-Minute Elevator Pitch

**Instructions:** Have the 3D visualization visible on screen while delivering. Speak at moderate pace (~2.5 words/second). Target: ~210 words.

Each line is annotated with the criteria it addresses.

---

> Every year, eight hundred billion to two trillion dollars is laundered through the global financial system. Hong Kong -- one of the world's top three financial centers -- sits at the crossroads of trillions in cross-border flows, making it ground zero for this fight.

**[M3: Impact, M5: Hook, A1: Business Value, H4: Real-world Impact]**

> The analysts protecting the system? They're drowning in spreadsheets. False positive rates above ninety-five percent. SAR reports that take hours to write. The tools have not kept up.

**[M3: Impact, A1: Business Value, H2: Entrepreneurial (pain point)]**

> ANGELA is an AI-powered 3D graph intelligence platform that transforms AML investigation. What you see here isn't a dashboard -- it's a spatial intelligence environment. Suspicious entities physically rise by risk. Jurisdictions map to lanes. Clusters glow and group in real time.

**[M1: Novelty, M5: Presentation, A3: Innovation, H1: Innovation]**

> Under the hood, fourteen distinct AI and ML techniques work together. A four-agent agentic investigation system running on AWS Bedrock takes a plain-English question, autonomously resolves entities, fuses risk from three detectors -- velocity anomaly, structuring threshold, and DFS cycle detection -- and delivers an investigator briefing.

**[M2: AI/ML, M4: Tech, A2: AWS Implementation, A3: Innovation, H3: Tech Execution]**

> Every risk score is fully explainable. Our counterfactual engine answers "what if this entity behaved normally?" by removing suspicious edges and recomputing -- transparency regulators demand.

**[M1: Novelty, M2: AI/ML, A1: Business Value (compliance), H1: Innovation]**

> One click auto-generates a complete SAR narrative. Hong Kong processes over a hundred thousand suspicious transaction reports a year. Each takes analysts hours. ANGELA drafts them in seconds.

**[M3: Impact, A1: Business Value, H2: Entrepreneurial, H4: Impact]**

> Full-stack typed architecture, GPU-instanced 3D rendering, real-time WebSocket, Docker-ready, pluggable AWS Bedrock integration. Built to ship, not just to demo.

**[M4: Tech & Scalability, A2: AWS Quality, H3: Tech Execution]**

> ANGELA turns AML investigation from needle-in-a-haystack into a guided flight through the data.

**[M5: Memorable close]**

---

**Word count:** ~220. **Delivery time:** ~1:25 at moderate pace.

### Criteria Coverage Verification

| Criterion | Addressed In | Times Hit |
|-----------|-------------|-----------|
| M1 Novelty & Creativity | 3D visualization, counterfactual | 2 |
| M2 AI/ML Techniques | 14 techniques, multi-agent, 3 detectors, counterfactual | 2 |
| M3 Impact & Relevance | $2T problem, 95% false positives, SAR volume, HK context | 3 |
| M4 Tech Implementation | Architecture stack, GPU instancing, Docker, WebSocket | 2 |
| M5 Presentation | Opening hook, 3D visual on screen, memorable close | 3 |
| A1 Business Value (TIEBREAKER #1) | $2T problem, analyst pain, SAR automation, compliance need | 4 |
| A2 AWS Implementation (TIEBREAKER #2) | "running on AWS Bedrock", "pluggable Bedrock integration" | 2 |
| A3 Innovation | 3D visualization, agentic investigation | 2 |
| H1 Innovation | 3D visualization, counterfactual | 2 |
| H2 Entrepreneurial | Analyst pain point, SAR automation value | 2 |
| H3 Tech Execution | Multi-agent system, architecture stack | 2 |
| H4 Real-world Impact | HK STR volume, analyst hours saved | 2 |

**All 12 criteria across all 3 tracks are explicitly addressed. Zero gaps.**

A1 (Business Value) is hit 4 times because it is the #1 tiebreaker for the AWS track.

---

## 3-Minute Final Round Expansion

Same structure, doubled depth. Add these sections between the elevator pitch beats:

### After the problem statement -- add market context:

> Global AML compliance spending exceeds two hundred seventy-four billion dollars a year. Banks spend more on compliance than they lose to fraud. Yet the technology hasn't changed in a decade. ANGELA is built for this gap.

**[A1: Business Value, H2: Entrepreneurial (TAM)]**

### After the 3D visualization -- add live demo moment:

> Let me show you. I'll inject a structuring pattern -- ten transactions just below the ten-thousand-dollar reporting threshold. Watch the entity rise in the graph. The risk score updates in real time. The cluster forms. A beacon appears. Everything you see streamed live via WebSocket.

**[M5: Presentation, M1: Novelty (live reaction), A1: Business Value (demo of detection)]**

### After the AI section -- add technical depth:

> The risk pipeline runs three stages: feature extraction computes per-entity velocity and amount distributions, three independent detectors score velocity, structuring, and circular flow, and a fusion layer combines them with explicit weights -- zero-point-four, zero-point-three, zero-point-three. Every weight is auditable.

**[M2: AI/ML (depth), M4: Tech (pipeline quality)]**

### After SAR generation -- add competitive landscape:

> The market leaders -- NICE Actimize, Featurespace, Feedzai -- all use two-dimensional rule-based dashboards. None offer three-dimensional spatial investigation. None offer agentic multi-agent analysis. None generate SARs from a natural language query. ANGELA operates in a different category.

**[M1: Novelty (vs competition), A1: Business Value (differentiation), H2: Entrepreneurial (moat)]**

### Before the close -- add the path forward:

> Next steps: pilot with a Hong Kong compliance team, validate on production transaction volumes, and build toward a SaaS platform. The architecture is already Docker-ready and provider-agnostic.

**[H2: Entrepreneurial, M4: Scalability, A1: Business Value]**

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
> We have a native AWS Bedrock integration via boto3's bedrock-runtime client using the Converse API. Our AI service layer supports two providers: OpenAI-compatible and Bedrock native. The four-agent investigation system -- Intake, Research, Analysis, Reporting -- runs its LLM calls through Bedrock. Entity summarization, SAR narrative generation, NLQ intent parsing, and cluster analysis all go through the same provider. The architecture is designed so switching providers is a single environment variable change.

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

| Time | Action | Criteria served |
|------|--------|----------------|
| 0:00-0:30 | Problem statement + market over static graph | M3, M5, A1, H4 |
| 0:30-1:00 | Walk through the 3D visualization: rotate, zoom, show spatial encoding | M1, M5, A3, H1 |
| 1:00-1:20 | Click an entity, show detail panel with risk reasons | M2, M5 |
| 1:20-1:50 | Inject a structuring anomaly live. Watch the graph react. | M1, M2, M5, A1 |
| 1:50-2:10 | Trigger SAR generation, show the narrative appear | M2, M3, A1, H2 |
| 2:10-2:30 | Show the multi-agent investigation running (WebSocket steps) | M2, A2, H3 |
| 2:30-2:45 | Flash the architecture diagram, mention Bedrock + Docker | M4, A2, H3 |
| 2:45-3:00 | Close: market size, path forward, memorable line | A1, H2, M5 |

### The money demo moment

The single most impactful demo beat: **inject an anomaly and watch the graph react in real time.** An entity glows, rises, a cluster forms, a beacon appears. This is 10 seconds of visual proof that everything works end-to-end: risk detection, fusion, clustering, WebSocket streaming, 3D rendering. Practice this transition until it's seamless.

---

## One-Page Cheat Sheet

Tape this to the back of your laptop during the pitch:

```
OPEN:   $2T laundered / HK = #3 financial center / analysts drowning / 95% false positives
SHOW:   3D graph -- risk=height, jurisdiction=lanes, KYC=depth -- "this isn't a dashboard"
AI:     14 AI/ML techniques / 4-agent agentic system on Bedrock / velocity + structuring + DFS cycles
EXPLAIN: counterfactual -- "what if normal?" -- remove edges, recompute, show delta
VALUE:  SAR in one click / 100K+ STRs in HK / hours → seconds
TECH:   typed full-stack / GPU instancing / WebSocket / Docker / Bedrock native
CLOSE:  "needle-in-a-haystack → guided flight through the data"
```
