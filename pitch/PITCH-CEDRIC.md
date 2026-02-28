# ANGELA -- Cedric's Part: 3-Minute Final Presentation + Q&A

**Round:** Final round (F2F at HKUST) -- 3-minute presentation + 3-minute Q&A with judges.

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

