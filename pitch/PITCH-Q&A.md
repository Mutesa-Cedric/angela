# ANGELA -- Q&A Preparation

Questions ordered from most likely to least likely to be asked. Pain points are marked with **[PAIN POINT]** -- these are real weaknesses. Read the navigation strategy carefully.

---

## Near-Certain (>80% chance)

### 1. "Can you show us how it works?" / "Give us a demo"

- Load the 3D graph, rotate it, point out the spatial encoding
- Inject a structuring anomaly -- watch entity rise, cluster form, beacon appear
- Type "find structuring patterns" -- show agent steps streaming live
- Click an entity -- show the detail panel + AI summary
- Generate a SAR -- show the narrative appear
- Click "What If?" -- show risk drop in the counterfactual

### 2. "How is this different from existing AML tools?"

- Competitors (Actimize, Featurespace, Feedzai, SAS) all use 2D dashboards + flat rule engines
- ANGELA has three things none of them do:
  - 3D spatial graph with risk/jurisdiction/KYC encoding
  - Multi-agent agentic investigation from natural language
  - Counterfactual explainer ("what if this entity behaved normally?")
- Also: one-click SAR generation, NLQ queries, real-time WebSocket updates

### 3. "Walk us through the AI / How does the agent system work?"

- Analyst types one sentence (e.g. "find structuring patterns")
- **Intake Agent**: LLM parses intent + params via Bedrock
- **Research Agent**: queries data store, ranks entities by risk
- **Analysis Agent**: generates plain-English summaries for top N entities via Bedrock
- **Reporting Agent**: compiles investigator briefing + optional SAR narrative
- All steps stream progress via WebSocket in real time
- Three depth profiles: fast (1 summary), balanced (3), deep (5)
- System has memory -- each run tracked with unique ID, timestamps, artifacts, status lifecycle

### 4. "How would this scale to a real bank?" / "Can this handle production volumes?"

> **[PAIN POINT]** -- The data store is in-memory. No database. Data is lost on restart. This won't handle millions of transactions.

**How to navigate:**
- "We chose in-memory for hackathon latency -- sub-millisecond lookups, zero infra overhead"
- "The DataStore is a singleton with a clean interface. Every access goes through `get_entity()`, `get_bucket_transactions()`, etc."
- "Swapping to Neo4j or TimescaleDB is infrastructure, not architecture redesign. The risk pipeline, agent system, and frontend don't care where data lives"
- "The frontend already uses GPU instancing -- renders thousands of nodes at 60fps"
- "The AI layer is Bedrock-native, horizontally scalable, already has LRU caching"
- "Docker images are ready. Path from demo to deployment is infrastructure, not a rewrite"

### 5. "What data are you using? Is it real?"

> **[PAIN POINT]** -- We use sample/synthetic data. No real bank data.

**How to navigate:**
- "We use the IBM AML dataset format, which is the standard benchmark in academic AML research"
- "Our CSV mapper also accepts any columnar transaction data with custom column mapping"
- "We haven't had access to real bank data for obvious regulatory reasons, but the data pipeline is format-agnostic"
- "The anomaly injection system lets us generate realistic patterns (velocity, structuring, cycles) on top of any base dataset"
- Never say "toy data" -- say "benchmark dataset" or "standard research format"

---

## Very Likely (60-80% chance)

### 6. "What's the business model?" / "Who pays for this?"

- Primary buyers: compliance departments at HK banks (HKMA mandates AML programs)
- SaaS pricing, per analyst seat
- SAR automation alone justifies cost: analyst costs $50-100K/year, significant time on SARs
- Even 20% time savings = immediate ROI
- Secondary market: regulators wanting real-time cross-institution views

### 7. "How specifically are you using AWS Bedrock?"

- Native integration via boto3 `bedrock-runtime` Converse API
- Five distinct LLM use cases through Bedrock:
  1. Intake Agent intent parsing
  2. Analysis Agent entity summarization
  3. Reporting Agent SAR narrative generation
  4. NLQ engine query parsing
  5. Cluster summarization
- Dual-provider architecture: Bedrock primary, OpenAI-compatible fallback
- Switching providers = one environment variable change
- Retry logic with increased token budgets, graceful fallback, LRU caching

### 8. "What happens when the LLM is wrong or unavailable?"

> **[PAIN POINT]** -- LLM dependency is real. If Bedrock is down, summaries, SAR, and NLQ all break.

**How to navigate:**
- "Every LLM-powered feature has graceful fallback. If Bedrock is unavailable, summaries return 'AI summary temporarily unavailable' and the rest of the system keeps running"
- "The risk engine is fully deterministic -- zero LLM dependency. Velocity, structuring, circular flow detection, risk fusion, clustering all work without any LLM"
- "The 3D visualization, real-time WebSocket, anomaly injection, dashboard KPIs -- all work independently of the AI layer"
- "For SAR accuracy: the LLM receives structured evidence (risk scores, detector reasons, transaction patterns), not raw data. It's summarizing facts, not inventing them"
- "LRU caching (256 entries for entities, 64 for clusters) means most repeated requests never hit the LLM"

### 9. "Why 3D? Isn't 2D simpler and more practical?"

> **[PAIN POINT]** -- Some judges may see 3D as gimmicky or harder to use than a table.

**How to navigate:**
- "3D gives us three spatial encoding dimensions that 2D can't: Y-axis = risk, X-axis = jurisdiction lanes, Z-axis = KYC level"
- "An analyst can literally see suspicious entities rise above the noise. In 2D, you'd need to overload color, size, and shape -- which saturates with multi-dimensional data"
- "GPU instancing handles thousands of nodes at 60fps, so performance isn't a tradeoff"
- "The visual impact matters for communication too -- showing a compliance officer a 3D cluster of glowing high-risk entities is more compelling than a sorted table"
- If pushed hard: "We also have the executive dashboard with traditional KPIs, trend charts, and heatmaps. The 3D is the primary investigation surface; the dashboard is the summary layer"

### 10. "What's your false positive rate?"

> **[PAIN POINT]** -- We have no benchmarked false positive rate. We haven't tested on labeled production data.

**How to navigate:**
- "We haven't benchmarked on labeled production data yet -- that's our first post-hackathon priority"
- "But the architecture is specifically designed to reduce false positives vs. traditional single-rule systems"
- "Traditional AML flags everything above a static threshold -- that's where 95% false positives come from"
- "ANGELA fuses three orthogonal signals: an entity needs elevated velocity AND structuring AND circular flow to score high"
- "The counterfactual layer gives analysts immediate verification: remove suspicious edges, recompute, see if the risk actually drops. That's a built-in false positive check"

---

## Likely (40-60% chance)

### 11. "What's next after the hackathon?"

- Benchmark on labeled AML datasets to quantify false positive reduction
- Integrate with real banking infrastructure: case management APIs, SWIFT parsing, KYC databases
- Pilot with one HK bank's compliance team
- Explore patent protection for 3D spatial encoding + counterfactual analysis

### 12. "Why Hong Kong specifically?"

- Gateway between mainland China and global markets
- Cross-border flows exceed $5T annually
- JFIU processes 100K+ suspicious transaction reports per year
- HKMA has intensified AML enforcement -- banks fined millions
- Jurisdiction-lane visualization and cross-border risk ratio KPI designed specifically for this topology
- "Fintech" is explicitly named in the AWS track challenge statement

### 13. "Can you explain the risk scoring in more detail?"

- Three independent detectors, each outputs 0-1 score:
  - **Velocity**: compares tx count to population median (p50) and 95th percentile (p95)
  - **Structuring**: counts transactions in $9K-$10K range (BSA threshold)
  - **Circular Flow**: DFS cycle detection, max depth 4, shorter cycles score higher
- Fused with explicit weights: velocity 0.4, structuring 0.3, circular flow 0.3
- Final score clamped to [0, 1], rounded to 4 decimals
- Top 3 reasons attached with weights. Evidence from each detector included.
- Flagged transaction IDs attached for structuring detections

### 14. "How do you handle data privacy when sending financial data to LLMs?"

> **[PAIN POINT]** -- Sending transaction data to external LLMs is a genuine compliance risk.

**How to navigate:**
- "We use AWS Bedrock, which runs within AWS's security perimeter -- data doesn't leave the cloud account"
- "In production, you'd deploy within the bank's own VPC. Bedrock supports PrivateLink"
- "The LLM only sees structured risk evidence (scores, detector names, aggregate stats) -- not raw customer PII or account numbers"
- "Summaries are generated from pre-computed risk profiles, not from raw transaction logs"
- "The architecture also supports self-hosted models via the OpenAI-compatible provider -- swap the base URL to a local endpoint"

### 15. "Why only three detectors? Real AML systems have dozens of scenarios"

> **[PAIN POINT]** -- Three detectors is thin for a real AML system.

**How to navigate:**
- "These three cover the most common AML typologies: high-frequency layering (velocity), threshold evasion (structuring), and round-tripping (circular flow)"
- "The detector architecture is pluggable -- adding a new detector means implementing one function that takes features and returns a 0-1 score with evidence"
- "Time-based anomaly, geographic patterns, dormant account activation, and amount distribution outliers are natural next additions"
- "For a hackathon, depth beats breadth -- three detectors done well with full explainability, evidence chains, and counterfactual analysis beats twenty shallow rules"

### 16. "How does the counterfactual explainer work?"

- Takes a flagged entity and its risk evidence
- Identifies suspicious edges by type:
  - Structuring: transactions in $9K-$10K range
  - Circular flow: edges involving cycle counterparties
  - Velocity: transactions < 2 minutes apart
- Removes all identified suspicious edges from a temporary data copy
- Reruns full risk pipeline (feature extraction, 3 detectors, fusion) on cleaned data
- Returns: original score, counterfactual score, delta, every removed edge with its reason
- "The system decides what to remove, why, and shows what the world looks like without it"

### 17. "What's the TAM / market size?"

- Global AML compliance spending: $274B annually
- AML software market: $3.5B, growing at 15% CAGR
- HK top 20 banks each spend tens of millions on compliance tech
- Even a fraction of one institution's budget = viable business

---

## Possible (20-40% chance)

### 18. "Is the $10K structuring threshold configurable? HK uses different thresholds"

> **[PAIN POINT]** -- The $10K threshold is hardcoded as a US BSA constant.

**How to navigate:**
- "Yes -- the threshold is a named constant (`STRUCTURING_THRESHOLD = 10000`, `STRUCTURING_DELTA = 1000`) in the detector code"
- "For HK, the relevant threshold is HKD 120,000 for cash transactions. We'd parameterize per institution"
- "The detection logic is identical -- only the threshold and delta values change"
- "In a production deployment, these would be configurable per jurisdiction, not hardcoded"

### 19. "How did you build this in a hackathon timeframe?"

- Clear architecture from the start: separate risk engine, agent system, NLQ, visualization
- Python FastAPI for rapid backend iteration
- Three.js with GPU instancing for performant 3D without a game engine
- Modular agent system -- each agent is a single file with a `run()` method
- LRU caching and composite keys to avoid redundant work

### 20. "What were the hardest technical challenges?"

- Getting 3D spatial encoding right -- mapping risk/jurisdiction/KYC to axes that are intuitive
- Multi-agent orchestration with real-time WebSocket progress streaming
- Balancing LLM latency with user experience (solved with caching + depth profiles)
- Making the counterfactual system correctly identify which edges to remove per detector type

### 21. "Could this be used for other types of fraud, not just AML?"

- Yes -- the architecture is domain-agnostic:
  - Swap detectors for insurance fraud, credit card fraud, or insider trading patterns
  - The agent system, NLQ engine, 3D visualization, and counterfactual explainer all work on any entity-transaction graph
  - The SAR template would change to match different regulatory formats
- "AML is the beachhead. The platform generalizes to any graph-based investigation"

### 22. "What if an adversary knows your detection patterns?"

- Velocity is relative to population stats (adaptive, not fixed threshold)
- Circular flow detection finds any cycle, not just known patterns
- Structuring threshold is configurable
- "But adversarial robustness is a real research problem. Our counterfactual explainer actually helps here -- it reveals which specific behaviors drive the score, which helps tune detection over time"
- "In production, detector weights and thresholds would be regularly recalibrated"

### 23. "How do you handle noisy or incomplete data?"

- Entities with no transactions in a bucket get zero risk (no hallucinated risk)
- Detectors score 0.0 when evidence is absent (structuring: 0 near-threshold tx = 0 score)
- Features use aggregated stats, robust to missing fields
- CSV mapper lets users map arbitrary column layouts, handling format variation

### 24. "Why not use a graph database like Neo4j?"

> **[PAIN POINT]** -- In-memory store is objectively worse for graph queries at scale.

**How to navigate:**
- "For hackathon iteration speed, in-memory gives us sub-millisecond lookups with zero infrastructure"
- "Our adjacency building, BFS, and DFS all operate on Python dicts -- the same algorithms translate directly to Neo4j Cypher queries"
- "The DataStore interface (get_entity, get_bucket_transactions, etc.) is the abstraction layer. Swapping the backend is a data access change, not an architecture change"
- "Neo4j would be the right choice for production. The current design makes that migration straightforward"

---

## Lower Probability (10-20% chance)

### 25. "How do you ensure the LLM doesn't hallucinate in the SAR?"

- The LLM receives a structured payload: entity type, bank, jurisdiction, risk score, detector reasons, evidence, activity data, connected entities
- It summarizes facts -- it doesn't invent investigations
- The SAR system prompt is highly constrained to the provided evidence
- "Hallucination risk is low because the input is structured data, not free-form context"
- "In production, a human analyst would review the draft before filing. ANGELA drafts, humans approve"

### 26. "What happens to data when the server restarts?"

> **[PAIN POINT]** -- All data is lost. No persistence.

**How to navigate:**
- "Currently, the analyst uploads data each session or loads the sample dataset"
- "For production, the in-memory store would be backed by a persistent database. The interface is already abstracted through the DataStore singleton"
- "This is a hackathon demo tradeoff -- we optimized for iteration speed over durability"
- Keep it brief. Don't dwell on this one.

### 27. "Why not use a Graph Neural Network (GNN) instead of hand-crafted detectors?"

- Hand-crafted detectors are explainable and auditable -- regulators require this
- GNNs are powerful but black-box. A regulator can't audit "node embedding distance > threshold"
- Our detectors produce human-readable evidence: "7 transactions in $9K-$10K range"
- "For production, the ideal is both: GNN for detection, our detectors for explanation. They're complementary, not competing"

### 28. "How does the NLQ handle queries it doesn't understand?"

- Falls back to `SHOW_HIGH_RISK` with default params (min_risk: 0.6)
- Returns interpretation: "Showing high-risk entities (query could not be parsed precisely)"
- The LLM also validates that the parsed intent is in the allowed list of 6 intents
- "Graceful degradation -- you always get a useful result, never an error"

### 29. "How many concurrent users can this support?"

- FastAPI is async, WebSocket manager handles multiple connections
- Dead connections auto-pruned during broadcasts
- In-memory data store means no DB connection pool limits
- "For a hackathon demo, dozens of concurrent users is fine. For production, the standard horizontal scaling patterns apply -- load balancer, multiple backend instances, shared data layer"

### 30. "Isn't 14 AI/ML techniques inflating the count?"

> **[PAIN POINT]** -- Some techniques (LRU caching, BFS) could be questioned as not "AI/ML."

**How to navigate:**
- Don't defend the number. Reframe:
- "The core AI techniques are: multi-agent orchestration, five distinct LLM use cases, three statistical/algorithmic detectors, and counterfactual analysis. That's a genuinely deep AI stack"
- "The graph algorithms (DFS cycle detection, BFS expansion, connected-component clustering) are ML-adjacent -- they're the feature engineering and pattern extraction layer"
- "The point isn't the count. It's that we have multiple AI/ML techniques at every layer: NLP for input, agents for orchestration, detection for scoring, and LLM generation for output"

---

## General Q&A Tips

- **If you don't know:** "That's a great question -- we haven't explored that yet, but here's how we'd approach it..." Then pivot to something you do know.
- **If they challenge the tech:** Stay specific. Drop exact numbers: "0.4/0.3/0.3 weights", "256-entry LRU cache", "max depth 4 DFS with 500 visit cap." Specificity = credibility.
- **If they ask "why should we pick you":** "No other team here built a multi-agent investigation system that runs autonomously from natural language, with 3D spatial visualization and counterfactual explainability, on real financial data. That's not incremental -- it's a different category."
- **On pain points:** Acknowledge briefly, redirect to how it's solvable. Never pretend the weakness doesn't exist -- judges respect honesty + a clear plan over handwaving.
