# Optimization Roadmap

> Analysis date: March 5, 2026  
> Scope: Caching, Sentiment, Conversation History Management, Event Relevance, and general system improvements.

---

## Overview

The current architecture is well-structured with BullMQ queues, Redis-backed caching for `Client`, `ClientPlatform`, `Agent`, and `AgentActions`, plus a message-window buffering system for DM debouncing. However, several high-value optimization opportunities exist across the LLM pipeline, conversation data management, and routing logic that are currently left on the table.

The findings below are grouped by implementation horizon.

---

## Short-Term (Days to 2 Weeks)

These require minimal architecture changes and have immediate, measurable impact on latency and LLM cost.

---

### 1. Conversation Message Caching

**Where:** `ConversationService` → `getConversationMessagesRelatedToSession`, `AgentService.verifySessionExistence`, anywhere `conversation.messages` is passed down.

**Problem:** Every event dispatched to a handler reloads conversation messages from PostgreSQL via a `getMessagesBySessionId` DB query. Across high-frequency DM conversations this is a repeated read for mostly stable data.

**Proposal:** Introduce a `ConversationCacheService` in Redis, keyed by `conversation:{conversationId}:messages:{sessionId}`. Cache the message list with a short TTL (e.g. 5–10 minutes). Invalidate/append on `addUserMessage` and `addAgentMessage`.

```
Key:   conversation:{conversationId}:messages:{sessionId}
Value: JSON-serialized ConversationMessageEntity[]
TTL:   5–10 min (sessions are short-lived)
```

This also makes the `bufferDMMessageForConversation` path cheaper — the polling `isProcessingConversation` check already uses Redis; message reads can too.

**Impact:** Reduces DB reads per conversation turn. High-frequency DM clients with multi-turn sessions benefit most.

---

### 2. Conversation Entity Caching

**Where:** `OrchestrationService.orchestrateEvent` → `conversationService.getOrCreateConversation`

**Problem:** `getOrCreateConversation` queries the DB on every incoming event even when the same sender keeps sending messages to the same thread. The `ConversationEntity` is largely static (platform, channel, clientId, postId) between turns.

**Proposal:** Cache the full `ConversationEntity` (excluding the mutable `messages` relation) keyed by `conversation:{senderId}:{channel}:{postId | "dm"}` with a TTL of ~30 minutes. On `addUserMessage` / `addAgentMessage`, update mutable fields (e.g., `lastMessageAt`, `activeAgentSessionId`) in-place instead of a full cache invalidation.

**Impact:** Eliminates the most frequent DB read in the hot path — every incoming webhook hits this query.

---

### 3. System Prompt Caching

**Where:** `PromptService.getSystemPromptForClientResponse`, `getSystemPromptForActionDecision`, `getRequestDataSystemPrompt`

**Problem:** These prompts are assembled from `ClientEntity` (business name, hours, description) and `AgentConfiguration` (reply rules) — data that changes very rarely. They are rebuilt from scratch on every LLM call.

**Proposal:** Cache the fully assembled system prompt strings in Redis (or even in-memory with `Map`) keyed by:
- `prompt:client_response:{agentId}:{clientId}` for response prompts
- `prompt:action_decision:{agentId}` for action selection prompts

TTL should match `AGENT_TTL` (12 hours). Invalidate on agent or client config updates.

**Impact:** Saves string assembly CPU and reduces prompt construction overhead. Especially valuable for the `BookingManagerHandler` which calls multiple generation methods per session turn.

---

### 4. Event Relevance Filtering (Smart Event Injection)

**Where:** `GenerationService.generateResponseWithClientContext` — the line `client.events?.length ? '\n\n' + this.promptService.getClientEventsPrompt(client.events) : ''`

**Problem:** ALL client events are appended to every response generation prompt, regardless of whether the user's message has anything to do with events. This bloats token count on every reply, increasing cost and potentially diluting the model's focus.

**Proposal:** Before injecting events into the prompt, apply a relevance filter:

1. **Temporal filter:** Only include events whose `startDate` is within the next 14 days or currently active (between `startDate` and `endDate`).
2. **Keyword filter:** Check if the incoming message contains topic keywords that overlap with event names/descriptions (e.g., "reservation", "promotion", "sale", event name tokens). Only inject events if there is a keyword match OR if no match but the event starts within 3 days (proximity promotion).
3. **Fall-through:** If no events pass the filter, inject nothing.

```typescript
// rough example
function filterRelevantEvents(events: ClientEventEntity[], messageText: string): ClientEventEntity[] {
  const now = new Date();
  const horizon = addDays(now, 14);
  const msgTokens = messageText.toLowerCase().split(/\s+/);
  return events.filter(e => {
    const isUpcoming = e.startDate && e.startDate <= horizon && (!e.endDate || e.endDate >= now);
    const isKeywordMatch = msgTokens.some(t => e.eventName.toLowerCase().includes(t) || e.description.toLowerCase().includes(t));
    return isUpcoming && (isKeywordMatch || daysBetween(now, e.startDate) <= 3);
  });
}
```

**Impact:** Token reduction on the majority of messages that have nothing to do with events. Direct LLM cost reduction.

---

### 5. Conversation History Management — Two Separate Problems

**Where:** Two distinct code paths, each with a different issue.

---

#### 5a. `conversation.messages` — The flat take:10 in ConversationRepository

`ConversationRepository.retrieveConversationBySenderIdAndChannel` fetches messages with a hardcoded `take: 10` (the `include: { messages: { orderBy: receivedAt desc, take: 10 } }` block). This is the cap the user already sees in practice. It applies universally — to Community Manager, Booking Manager, and everything else — regardless of what stage the conversation is at or what the handler actually needs.

The problem with this flat cap is that it is **context-blind**:
- A Community Manager replying to a first-time Instagram comment has 1–2 messages and the cap is irrelevant.
- A Booking Manager in the `manage_booking` stage of a verbose SMS exchange may have had 9 of its 10 most important data-capture exchanges cut off, because 10 messages back the user was still in `confirm_data`.
- The cap is the same whether the session started 5 minutes ago or 3 days ago.

---

#### 5b. `getMessagesBySessionId` — The uncapped path

`ConversationMessageRepository.getMessagesBySessionId` is called by `AgentService.verifySessionExistence` (used in `CrmIntegrationHandler`) and fetches **every single message** linked to an `agentSessionId` with no limit whatsoever. For a long-running CRM integration session with many back-and-forth turns this is an unbounded DB read and an unbounded token payload to the LLM.

---

#### How to define session length — message count, not time windows

"Medium session" should be defined by **message count within the current agent session**, not by time elapsed between messages. Time gaps are a separate signal (see below).

The count can be derived cheaply at runtime:

```typescript
// Already available when verifySessionExistence returns messages
const sessionMessageCount = messages.length;
```

Or added as an integer column `messageCount` on `AgentSession` and incremented on each `addAgentMessage` / `addUserMessage` that links to the session — this avoids a COUNT query entirely.

**Proposed tiers by session message count:**

| Tier | Condition | History Strategy |
|---|---|---|
| Fresh | 0–6 messages in session | Pass all — no truncation |
| Active | 7–20 messages in session | Pass most recent 12; prepend session summary if one exists |
| Deep | 21+ messages in session | Pass most recent 8; **require** a summary; trigger background summarization job if no summary exists yet |

These thresholds are deliberately stage-aware for Booking Manager: `confirm_data` typically completes in 3–8 turns, `manage_booking` in 4–10. So staying within the "Fresh" tier keeps every stage self-contained without truncation risk.

---

#### Time gap as a second, orthogonal dimension

Time between messages answers a different question: **is the user returning to a dead conversation, or are they mid-flow?**

If `lastMessageAt` on the `ConversationEntity` is more than, say, 4 hours ago, the most recent 8 messages may all be stale slot-filling from a previous day — including them verbatim does not help the model. In this case, the right strategy is:

1. Use the session summary (if it exists) instead of raw messages, regardless of message count.
2. If no summary exists, generate one before the current LLM call (blocking, but this is a cold-start edge case).
3. Append a short temporal marker to the prompt: `"[Note: user returned after a gap of ~6 hours]"` — this signals the model to re-acknowledge context rather than treating it as an unbroken flow.

**Combined decision matrix:**

| Message count | Time since last message | Strategy |
|---|---|---|
| Any | > 4 hours | Summary only + temporal marker |
| 0–6 | < 4 hours | Full messages |
| 7–20 | < 4 hours | Last 12 messages + summary prefix if available |
| 21+ | < 4 hours | Last 8 messages + required summary |

---

#### What to do about the flat `take: 10` right now

The immediate fix is to **remove the hardcoded** `take: 10` from `ConversationRepository` and replace it with a parameter fed from the handler layer, which knows the session stage and message count:

```typescript
// ConversationRepository
async retrieveConversationBySenderIdAndChannel(
  senderId: string,
  channel: PlatformChannel,
  postId?: string,
  messageLimit: number = 10, // explicit, removable per-caller
)
```

Handlers that don't need full history (CommunityManager, first-message cases) keep `10`. Stateful handlers (BookingManager `manage_booking` stage, CrmIntegration mid-session) request the full session slice or use `getMessagesBySessionId` exclusively — which then gets its own `take` parameter added.

**Impact:** Removes the silent truncation bug in stateful handlers. Reduces unnecessary message loads in stateless handlers. Sets the foundation for the full tiered strategy without a big-bang refactor.

---

## Mid-Term (2–6 Weeks)

These require new modules or non-trivial changes to existing ones.

---

### 6. Sentiment & Urgency Layer

**Where:** New pre-routing step in `OrchestrationService.orchestrateEvent`, before `requireAgentDecision`.

**Problem:** Every message — from a casual "thanks!" to an angry complaint — goes through the same full LLM agent decision pipeline. There is no fast path for high-priority or trivially low-priority signals.

**Proposal:** Introduce a lightweight `SentimentService` that runs before agent routing. This does NOT need to be a full ML model — a tiered approach works well:

**Tier 1 — Rule-Based (free, instant):**
- Keyword regex for urgency: `urgent|emergency|asap|right now|complaint|threatening|refund|lawyer|police` → flag as `HIGH_URGENCY`.
- Keyword regex for trivial positive: `thanks|😊|👍|great|love it|awesome` (short message, no question marks) → flag as `LOW_PRIORITY`.

**Tier 2 — Fast LLM classification (optional, cheap):**
- Use a minimal model tier (e.g., tier 0 / smallest model) to classify sentiment as `POSITIVE | NEUTRAL | NEGATIVE | URGENT` and extract urgency score 0–1.
- Only invoke if rule-based tier returns no signal.

**Outcomes of sentiment classification:**

| Sentiment | Routing Effect |
|---|---|
| `HIGH_URGENCY` | Bypass action decision → jump straight to ESCALATE/ALERT action |
| `NEGATIVE` (strong) | Weight toward ESCALATE action; include sentiment score in prompt context |
| `POSITIVE` (trivial) | Consider using cached/templated response, skip CAPTURE_DATA paths |
| `NEUTRAL` | Current pipeline unchanged |

**Schema addition:** Add a `sentimentScore: Float?` and `sentimentLabel: String?` column to `ConversationMessage` so historical sentiment is queryable for analytics and future adaptive routing.

**Impact:** Reduces escalation response time (critical for customer experience). Reduces unnecessary LLM action decision calls for obvious sentiment cases. Enables analytics on client satisfaction trends.

---

### 7. Conversation History Necessity Classifier

**Where:** Before assembling context in any `GenerationService` method.

**Problem:** The system currently makes a binary decision — either include all session messages, or none. There is no logic for determining *when* history changes the model's output meaningfully.

**Proposal:** Implement a `HistoryRelevanceClassifier` that decides how much history, if any, to include based on:

**Rules-based signals (cheap, first pass):**

| Condition | History Decision |
|---|---|
| First message in session | No history to include — skip |
| Message is a direct question (`?` present, short) | Include last 3 messages only for context |
| Active data collection stage (BookingManager `confirm_data`) | Include all session messages (state machine needs full trace) |
| Active data collection stage (BookingManager `check_availability`) | Include confirmed fields + last 5 messages |
| Community Manager REPLY action, first-time conversation | No history necessary |
| Community Manager REPLY action, returning conversation | Last 5 messages only |
| ESCALATE/ALERT triggered | Full history (human needs full context) |

This classifier can be a simple function that takes `(sessionState, channel, actionType, messageCount)` and returns a history slice strategy (full / last-N / summary-only / none).

**Benefits over a flat cap:** Unlike a simple length cap (item 5 above), this is context-aware. A booking session in the `confirm_data` stage genuinely needs all prior collected data. A community manager replying to a first comment does not.

**Impact:** Reduces average token usage across all generation calls. Improves model focus by removing noise. Works synergistically with the rolling summary (item 5).

---

### 8. Agent Decision Short-Circuiting (NOT Result Caching)

**Where:** `OrchestrationService.requireAgentDecision`

**Why caching the decision result is the wrong model:**

Caching `agentKey` across subsequent messages — even with a high-confidence threshold — is dangerous and should not be done. The core problem: message N+1 may be a completely different intent from message N. A user who starts with "I'd like to book a table" and then follows up with "Actually I want to complain and I'll be leaving a review" should trigger ALERT/ESCALATE, not be frozen to `BOOKING_MANAGER` because the prior message cached it. Word-triggered actions (ESCALATE, ALERT) live in the *action decision* layer inside the handler, but the *agent decision* layer still determines which handler processes the message. Locking that to a cache means a hostile or urgent follow-up goes into the wrong pipeline.

Additionally, caching by conversation for stateful agents is **already solved by the existing session mechanism**: `conversation.session` short-circuits the LLM call entirely — no model invocation happens if a session is already open. That is the correct "sticky routing" primitive for stateful agents. Layering a Redis cache on top would be redundant and would create a second, inconsistent source of truth.

**What the actual legitimate opportunity is:**

The LLM call to `requestAgentDecision` is only genuinely *necessary* when:
1. No active session exists (first message of a new conversation), AND
2. More than one agent is active (`activeAgents.length > 1`).

Looking at the existing code, case (2) is already handled — `if (activeAgents.length === 1)` already short-circuits without calling the model. That leaves only multi-agent clients with no active session.

For those cases, the right optimization is a **client-level dominance prior** from `AgentLogRepository` data — not a per-conversation cache:

1. Periodically compute (e.g., on client config load) the historical selection ratio per agent for a given client. Store this alongside the cached `ClientEntity`.
2. If one agent has been selected in >95% of conversations for this client over the last 30 days, treat it as the default and skip the model decision.
3. This shortcut MUST be bypassed if the sentiment/urgency layer (point 6) has already flagged the message as `HIGH_URGENCY` or `NEGATIVE` — those cases always need a full evaluation.

```typescript
// rough sketch in requireAgentDecision
const dominantAgent = client.agentStats?.dominantAgent; // precomputed, cached with ClientEntity
if (dominantAgent && dominantAgent.selectionRatio >= 0.95 && !isHighUrgency) {
  const agent = activeAgents.find(a => a.agentKey === dominantAgent.agentKey);
  if (agent) return agent; // skip LLM call
}
// fall through to model decision
```

**Dependency:** This optimization only makes sense if point 6 (sentiment layer) exists as a pre-check. Without it, a high-urgency message to a booking-heavy client would still go to `BOOKING_MANAGER` because the dominance prior fires before any urgency check. The sentiment layer must run first and have veto power.

**Impact:** Reduces LLM routing calls for clients with a single dominant use case without introducing routing-freeze risk. Benefits are bounded — only applies to multi-agent clients with dominant selection patterns. Lower overall impact than the original caching proposal, but safe.

---

### 9. Rolling Conversation Summary (Persistent Compression)

**Where:** `AgentService.updateAgentSession` on session close + `GenerationService.generateConversationSummary`

**Problem:** `generateConversationSummary` exists in `GenerationService` but there is no evidence it is called after a session completes to compress history for future turns. The `AgentSessionEntity.summary` field exists but appears unused in the active path.

**Proposal:**
1. After a session closes (`AgentSessionStatus.COMPLETED`), dispatch a BullMQ job to generate and persist the conversation summary. Do NOT block the current response on this.
2. Store summary in `AgentSession.summary`.
3. In `ConversationService.getOrCreateConversation` / `verifySessionExistence`, load the most recent completed session's summary and prepend it to the history passed to generation methods.

```typescript
// In Generation prompts, history becomes:
`[PRIOR SESSION SUMMARY]: ${lastCompletedSession.summary}\n\n[CURRENT SESSION MESSAGES]:\n${formattedCurrentMessages}`
```

**Impact:** Allows the model to maintain continuity across sessions without exponentially growing token counts. Enables more coherent multi-session conversations (e.g., a customer who books weekly, or escalation follow-ups).

---

### 10. Queue Payload Size Reduction

**Where:** `OrchestrationService.routeToQueue` → `WorkerJobData`

**Problem:** `WorkerJobData` currently passes the full `ClientEntity` (including nested `events`, `platforms`, `agents`, `credentials` arrays), the full `ConversationEntity`, and the full `AgentEntity` as BullMQ job payload. These are serialized to JSON and stored in Redis. For clients with many events or agents, this payload may be several KB per job.

**Proposal:** Pass only IDs in the job payload and resolve entities at the start of each worker's `process()` method, leveraging the existing Redis caches:

```typescript
interface WorkerJobData {
  clientId: string;
  agentId: string;
  conversationId: string;
  credentialId: string;
  targetId: string;
}
```

Workers call `clientService.getClientById(clientId)` (cache hit), `agentService.getAgent(agentId)` (cache hit), `conversationService.getConversationById(conversationId)`.

**Impact:** Reduces Redis job memory footprint. Avoids sending stale entity snapshots to workers (if a client config updates between enqueue and process, the worker gets the fresh version). Reduces BullMQ throughput overhead.

---

## Long-Term (6+ Weeks / Strategic)

These represent significant architectural additions with the highest long-term ROI.

---

### 11. LLM Semantic Response Cache

**Where:** `GenerationModel.sendToModel`

**Problem:** Semantically-equivalent prompts (e.g., "What are your hours?" vs "When are you open?") result in separate LLM calls that return nearly-identical responses. There is no deduplication at the generation layer.

**Proposal:** Implement a semantic cache using embeddings:
1. Before calling the LLM, compute an embedding of the prompt (using a lightweight embedding model or the LLM provider's embedding API).
2. Query a vector index (e.g., Redis with the `RediSearch` module using HNSW, or `pgvector` in the existing Postgres) for the nearest neighbor above a similarity threshold (e.g., cosine similarity ≥ 0.95).
3. If a match is found, return the cached response and skip the LLM call.
4. On cache miss, call the LLM, store the (embedding, response, agentId, clientId) tuple.

This is most impactful for `generateResponseWithClientContext` and `requestAgentDecision` where input variability is relatively low for structured business contexts.

**Impact:** Up to 30–50% reduction in LLM calls for high-volume clients with predictable conversation patterns (FAQ-style interactions). Direct cost reduction scales with message volume.

---

### 12. Multi-Turn Context State Machine

**Where:** `AgentSessionEntity.state`, handler logic in `BookingManagerHandler`, `CrmIntegration`, `CommunityManagerHandler`

**Problem:** Only `BookingManagerHandler` has an explicit state machine (`stage: confirm_data | check_availability | manage_booking | send_confirmation`). `CommunityManagerHandler` and `CrmIntegration` are essentially stateless per turn. This means:
- No way to know if a conversation is in a "greeting phase", "problem clarification phase", or "resolution phase"
- Action decisions repeat LLM logic they could short-circuit given known state
- History necessity cannot be determined accurately without state context

**Proposal:** Define a shared `ConversationStageEnum` that all agents can set on `AgentSession.state`:

```
INITIAL → NEEDS_CLARIFICATION → COLLECTING_DATA → PENDING_ACTION → AWAITING_EXTERNAL → RESOLVED | ESCALATED
```

Rules for stage transitions are defined per agent (or globally). Each stage has a defined history policy (from item 7), default action priorities, and a prompt modifier (e.g., NEEDS_CLARIFICATION appends "Ask a clarifying question").

**Impact:** Enables all downstream decisions (history depth, event injection, action decision, sentiment routing) to become stage-aware. The foundation for all other optimization layers to operate at maximum efficiency.

---

### 13. Adaptive Agent Decision Scoring

**Where:** `AgentLogRepository`, `OrchestrationService.requireAgentDecision`

**Problem:** `AgentLogRepository` records every agent decision with `decisionScore` and `reason`, but this data is never read back to improve routing. Each decision is made independently without learning from past outcomes.

**Proposal:**
1. Add an `outcome` field to `AgentLog` that gets written when a session closes (e.g., `COMPLETED`, `ESCALATED`, `FAILED`, `ABANDONED`).
2. Build a periodic job (weekly, or after N sessions) that computes per-agent accuracy: how often did the chosen agent's session actually complete successfully vs. escalate/fail?
3. Use this as a confidence prior: if `COMMUNITY_MANAGER` has historically been selected for messages with certain keywords but sessions always escalate, reduce its decision weight for those patterns and flag for human review.

**Impact:** Closes the feedback loop on LLM routing quality. Over time, enables data-driven prompt tuning and agent configuration improvements. The foundation for A/B testing agent configurations.

---

### 14. Observability Layer for the LLM Pipeline

**Where:** `GenerationModel.sendToModel`, each handler's `handle()` entry/exit

**Problem:** There are currently no metrics on:
- LLM call latency per model tier
- Token consumption per conversation / per client
- Cache hit/miss rates for `Client`, `Agent`, `Actions` caches
- Queue depth and job processing latency per agent queue
- `decisionScore` distribution over time (are decisions getting more/less confident?)

**Proposal:** Instrument with Prometheus metrics (or inject into the existing logger):

```typescript
// Example metrics
agent_decision_latency_ms{agent_key, model_tier}
llm_call_tokens_total{type: "input|output", agent_key, client_id}
cache_hit_total{cache: "client|agent|actions|conversation"}
cache_miss_total{cache: "client|agent|actions|conversation"}
queue_job_latency_ms{queue_name}
session_outcome_total{agent_key, outcome}
```

**Impact:** Makes all other optimization work measurable. Without metrics, cache hit rates and LLM cost reductions are invisible. Required before claiming impact from any of the above items.

---

## Summary Matrix

| # | Optimization | Category | Effort | Impact |
|---|---|---|---|---|
| 1 | Conversation message caching | Caching | Low | High |
| 2 | Conversation entity caching | Caching | Low | High |
| 3 | System prompt caching | Caching | Low | Medium |
| 4 | Event relevance filtering | Context quality | Low | Medium |
| 5 | History management (count + time gap tiers) | Context quality | Low | High |
| 6 | Sentiment & urgency layer | Routing intelligence | Medium | High |
| 7 | History necessity classifier | Context quality | Medium | High |
| 8 | Agent decision short-circuiting (dominance prior) | Routing intelligence | Medium | Low-Medium |
| 9 | Rolling conversation summary | Context quality | Medium | High |
| 10 | Queue payload size reduction | Infrastructure | Medium | Medium |
| 11 | Semantic LLM response cache | Caching | High | Very High |
| 12 | Multi-turn state machine | Architecture | High | Very High |
| 13 | Adaptive agent decision scoring | Intelligence | High | High |
| 14 | Observability layer | Infrastructure | Medium | Critical (enabler) |

---

## Recommended Sequencing

```
Week 1–2:  Items 1, 2, 3, 4, 5   → Quick wins: caching + context pruning
Week 3–4:  Item 14               → Establish metrics before bigger changes
Week 5–8:  Items 6, 7, 9, 10     → Sentiment + history intelligence + infra
Week 9–16: Items 8, 11, 12, 13   → Strategic / architectural layer
```

Items 1–5 together likely reduce LLM token spend by 20–40% and DB load by 30–60% on active clients without touching any agent logic.  
Item 14 should be done early so the gains from all other items are measurable.  
Items 6 and 7 are the highest-leverage correctness improvements (better routing = better customer experience).  
Items 11–13 are longer bets but compound in value as message volume grows.
