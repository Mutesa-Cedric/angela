# ANGELA -- Cedric's Part: 3-Minute Final Presentation + Q&A

**Round:** Final round (F2F at HKUST) -- 3-minute presentation + 3-minute Q&A with judges.

**Your job:** Deliver a live demo that proves everything wyli pitched in the elevator round. You have double the time and can interact with the app. The Q&A follows immediately -- prepared answers are at the bottom.

---

## What You're Presenting To

Same tracks: **Main Awards** + **Ingram Micro & AWS Agentic AI Champion**.

| Track | Criteria |
|-------|----------|
| **Main Awards** | Novelty, AI/ML Techniques, Impact, Tech Quality, Presentation |
| **AWS Agentic AI** | Business Value (#1 tiebreaker!), AWS Implementation, Innovation |

**The final round is where you PROVE IT with a live demo.** The elevator pitch made promises. You deliver receipts.

---

## Your 3-Minute Script with Live Demo

### 0:00-0:20 -- Problem + Market (speak over static graph)

> Every year, two trillion dollars is laundered globally. Hong Kong sits at the center -- trillions in cross-border flows, over a hundred thousand suspicious transaction reports filed annually. Global AML compliance spending exceeds two hundred seventy-four billion dollars a year. Banks spend more on compliance than they lose to fraud. Yet the technology hasn't changed in a decade. ANGELA is built for this gap.

### 0:20-0:40 -- Walk the 3D Visualization (rotate, zoom, point)

> What you see is ANGELA's 3D graph intelligence environment. Each node is a financial entity. Height maps to risk score -- suspicious entities rise. Horizontal lanes represent jurisdictions. Clusters of connected high-risk entities glow and group. This is spatial intelligence applied to financial crime.

### 0:40-1:00 -- LIVE DEMO: Inject Anomaly

**[Do this live: trigger a structuring injection]**

> Let me show you the system in action. I'm injecting a structuring pattern -- ten transactions just below the ten-thousand-dollar reporting threshold. Watch -- the entity rises in the graph. The risk score updates in real time via WebSocket. A cluster forms. A beacon appears. Everything streamed live.

### 1:00-1:40 -- LIVE DEMO: Run Agentic Investigation

**[Do this live: type "find structuring patterns" in the NLQ input]**

> Now the agentic part. I'll type one question: "find structuring patterns." Watch the panel -- you can see each agent step streaming in real time. Intake Agent: parsing the query. Research Agent: resolving entities, ranking by risk. Analysis Agent: generating a plain-English summary for the top entity via AWS Bedrock. Reporting Agent: compiling the full investigator briefing. There -- a complete investigation from one sentence. Four agents, fully autonomous.

### 1:40-2:00 -- LIVE DEMO: Show the Briefing, Generate SAR

**[Do this live: click through the briefing, then click "Generate SAR" on the top entity]**

> Here's the briefing -- ranked entities, risk scores, AI-generated summaries explaining why each is suspicious. Now I'll generate a Suspicious Activity Report on this entity. The agent gathers risk evidence, transaction patterns, connected entities, and writes a multi-paragraph regulatory narrative. This document normally takes compliance analysts four to eight hours. Our agents produce it in seconds.

### 2:00-2:20 -- LIVE DEMO: Counterfactual

**[Do this live: click "What If?" on the flagged entity]**

> And here's what no other AML tool does. I click "What If?" -- the system autonomously identifies which transactions are suspicious, removes them, reruns the entire risk pipeline, and shows the delta. This entity's risk drops from high to low without the structuring transactions. That's not a black box -- that's explainable AI a regulator can trust.

### 2:20-2:40 -- Technical Depth

> Under the hood: three independent risk detectors -- velocity anomaly scoring, structuring threshold detection, DFS cycle detection -- fused with explicit weights. Fourteen distinct AI and ML techniques total. Typed full-stack architecture, GPU-instanced 3D rendering, real-time WebSocket, Docker-ready, native AWS Bedrock integration via boto3.

### 2:40-3:00 -- Competitive Landscape + Close

> The market leaders -- NICE Actimize, Featurespace, Feedzai -- all use two-dimensional rule-based dashboards. None offer 3D spatial investigation. None have agentic multi-agent analysis. None generate SARs from natural language. None provide counterfactual explainability. ANGELA is a different category of tool.

> Next steps: pilot with a Hong Kong compliance team, validate on production volumes, build toward SaaS. The tech is real, the market is massive, and the problem isn't going away.

---

## Live Demo Checklist

**Before you go on stage, confirm:**

- [ ] Backend is running (`localhost:8000/health` returns ok)
- [ ] Frontend is loaded with sample data (`localhost:5173`)
- [ ] 3D graph is rendering and orbiting
- [ ] NLQ input field is visible and ready
- [ ] WebSocket is connected (agent steps will stream)
- [ ] Test one injection + one investigation beforehand so caches are warm

**Demo sequence (practice this 5+ times):**

1. Inject structuring anomaly → watch graph react (~15s)
2. Type "find structuring patterns" → watch agent steps stream → briefing appears (~30s)
3. Click "Generate SAR" on top entity → narrative appears (~15s)
4. Click "What If?" counterfactual → risk delta shown (~10s)

**If something breaks during the demo:**
- If injection fails: skip it, go straight to the NLQ investigation
- If agent steps are slow: narrate what's happening ("the Analysis Agent is generating a summary via Bedrock right now...")
- If anything crashes: switch to talking about the architecture and show the 3D graph statically. You can recover.

---

## Q&A Prepared Answers

You have 3 minutes of Q&A. Here are the most likely questions from each judging panel.

### From Main Awards judges:

**"How is this different from existing AML tools?"**
> Existing tools -- Actimize, Featurespace, SAS -- use 2D dashboards, flat rule engines, and manual investigation workflows. ANGELA introduces three differences: 3D spatial intelligence that encodes risk, jurisdiction, and KYC into physical space; a multi-agent agentic investigation system that takes natural language and produces investigator briefings; and a counterfactual explainer that shows not just what the risk is, but why and how it would change. No current commercial product combines these.

**"Can you explain the risk scoring in more detail?"**
> Three independent detectors. Velocity compares transaction count to population percentiles -- the median and 95th -- so scoring adapts to the dataset. Structuring counts transactions in the nine-to-ten-thousand dollar range, just below the BSA reporting threshold. Circular flow runs depth-limited DFS to find 3-to-4-node cycles. Each produces a zero-to-one score. We fuse them: velocity at 40%, structuring 30%, circular flow 30%. The weights are explicit, auditable, and adjustable. Regulators can see exactly which signal drove the score.

**"How would this scale to a real bank?"**
> The current architecture uses an in-memory data store for hackathon speed. For production: the data layer swaps to a graph database or time-series store, the risk pipeline parallelizes per-entity, and the frontend already uses GPU instancing -- it renders thousands of nodes at 60fps. The AI layer is Bedrock-native and horizontally scalable. Docker images are ready. The path from demo to deployment is infrastructure, not architecture redesign.

**"What's the false positive rate?"**
> Traditional systems flag everything above a static threshold -- that's where the 95% comes from. ANGELA's risk fusion is multi-signal: an entity needs elevated velocity AND structuring AND circular flow to score high. The counterfactual layer lets analysts immediately verify whether flagged behavior is the actual driver. We haven't benchmarked on labeled production data yet, but the architecture reduces false positives by fusing orthogonal signals rather than relying on a single rule.

### From AWS/Ingram Micro judges:

**"How specifically are you using Bedrock?"**
> Bedrock is the backbone of every agentic capability. The AI service layer integrates natively via boto3's bedrock-runtime Converse API. Every LLM call routes through Bedrock: the Intake Agent's intent parsing, the Analysis Agent's entity summarization, the Reporting Agent's SAR narrative generation, the NLQ engine's query parsing, and cluster summarization. That's five distinct agentic use cases on a single Bedrock integration. We also support an OpenAI-compatible fallback -- switching providers is a single environment variable -- but Bedrock is the primary production path. The architecture includes retry logic, graceful fallback on errors, and LRU caching to minimize redundant calls.

**"Who would buy this and how would you monetize?"**
> Primary buyers: compliance departments at Hong Kong banks and financial institutions. The HKMA requires AML programs -- banks already have compliance budgets. ANGELA sells as SaaS, priced per analyst seat. The SAR automation alone justifies the cost: a compliance analyst costs $50-100K USD annually, and they spend a significant portion of time writing SARs. If ANGELA saves even 20% of that time, the ROI is immediate. Secondary market: regulators who want a real-time view across institutions.

**"Why is this a Hong Kong problem?"**
> Hong Kong is the gateway between mainland China and global financial markets. Cross-border flows exceed five trillion dollars annually. The JFIU processes over a hundred thousand suspicious transaction reports per year. HKMA has intensified AML enforcement -- banks have been fined millions. ANGELA's jurisdiction-lane visualization and cross-border risk ratio KPI were designed specifically for this cross-jurisdictional topology.

### From HKUST EC judges (if applicable):

**"What's your go-to-market strategy?"**
> Phase 1: Pilot with one HK bank's compliance team -- we already handle real transaction data formats. Phase 2: Iterate on analyst feedback, integrate with case management systems. Phase 3: SaaS launch targeting mid-tier HK banks. Phase 4: Expand to APAC -- Singapore, Tokyo, Sydney. Docker-ready, provider-agnostic, fast deployment.

**"What's the TAM?"**
> Global AML compliance spending: $274 billion annually. AML software market: $3.5 billion, growing at 15% CAGR. In Hong Kong, the top 20 banks each spend tens of millions on compliance tech. Even a fraction of one institution's budget is a viable business.

**"What's next after the hackathon?"**
> Three priorities. Benchmark on labeled AML datasets to quantify false positive reduction. Integrate with real banking infrastructure -- case management APIs, SWIFT message parsing, KYC databases. Explore patent protection for the 3D spatial encoding scheme and counterfactual analysis method.

---

## Q&A Tips

- **If you don't know the answer:** "That's a great question -- we haven't explored that yet, but here's how we'd approach it..." Then pivot to something you do know.
- **If they ask about something you demoed:** Pull it up on screen again. Showing > telling.
- **If they challenge the tech:** Stay calm, be specific. Mention exact numbers: "0.4/0.3/0.3 weights", "14 techniques", "256-entry LRU cache", "max depth 4 DFS". Specificity = credibility.
- **If they ask "why should we pick you":** "No other team at this hackathon built a multi-agent agentic investigation system that runs autonomously from natural language, with 3D spatial visualization and counterfactual explainability, on real financial transaction data. That's not incremental -- that's a different category."
