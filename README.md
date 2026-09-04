# 🍕 RazorSlice: Autonomous Agent-to-Agent (A2A) Procurement with UPI Circle & Razorpay Resilience

[![Tests: 73/73 Passing](https://img.shields.io/badge/Tests-73%2F73%20Passing-10b981?style=for-the-badge&logo=node.js)](file:///D:/uni/a2a-razorpay-buildathon-project/server)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict%20Mode-3178c6?style=for-the-badge&logo=typescript)](file:///D:/uni/a2a-razorpay-buildathon-project)
[![NPCI UPI Circle: Delegated Mandate](https://img.shields.io/badge/NPCI-UPI%20Circle%20Semantics-0284c7?style=for-the-badge)](file:///D:/uni/a2a-razorpay-buildathon-project)
[![Razorpay: Orders & Webhooks](https://img.shields.io/badge/Razorpay-Live%20Orders%20%26%20Webhooks-0052cc?style=for-the-badge)](file:///D:/uni/a2a-razorpay-buildathon-project)
[![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel%20Serverless-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![BYOK Security: Zero Storage](https://img.shields.io/badge/BYOK-Zero%20Storage%20Keys-orange?style=for-the-badge)](file:///D:/uni/a2a-razorpay-buildathon-project)

> **"The LLM proposes, the Policy Engine disposes."**  
> An enterprise-grade, autonomous commerce engine where AI agents negotiate wholesale food procurement, enforce hard financial guardrails, and settle funds over Razorpay and UPI Circle semantics with zero hallucinations and production-grade failure recovery.

---

## 🚀 Try It Live: Bring Your Own Keys (BYOK) — Zero Setup

> **No cloning or local setup required to test with your own Razorpay dashboard.** You can run the entire agent-to-agent procurement and Razorpay settlement lifecycle against your own live or test Razorpay account directly from your browser!

### How Bring-Your-Own-Keys (BYOK) Works:
- 🔒 **Zero Server-Side Storage:** Your `Key ID`, `Key Secret`, and optional `Webhook Secret` / `Gemini API Key` are stored exclusively in your browser's `localStorage`. They are **never** saved to disk, database, or server logs.
- ⚡ **Stateless Per-Request Authentication:** When you trigger an A2A deal, your keys are transmitted via secure HTTPS request headers (`x-razorpay-key-id`, `x-razorpay-key-secret`, `x-razorpay-webhook-secret`). The backend dynamically provisions an ephemeral Razorpay client instance for your request and immediately discards credentials from memory when the operation finishes.
- 🧪 **Live Connection Test:** Click the **🔑 API Keys (BYOK)** button in the top navigation bar to open the credentials drawer. You can verify your keys in real time against Razorpay's `/v1/orders` endpoint before initiating negotiations.
- 🎮 **Instant Sandbox Fallback:** Don't have Razorpay test keys right now? Simply leave the fields blank or click **"Reset to Sandbox Mode"** to experience full end-to-end A2A negotiations, policy checks, failure recovery, and UPI Circle mobile approvals with zero configuration!

---

## Quick Pitch: What is RazorSlice?

In commercial kitchens, inventory procurement is chaotic, time-consuming, and prone to overpaying. But handing an autonomous AI agent a credit card or payment API token is a financial nightmare: LLMs hallucinate numbers, miscalculate budgets, and cannot be trusted with real money.

**RazorSlice** solves this for **RazorSlice**, an artisan Italian pizza restaurant:

1. **Customer orders arrive** (e.g. Margherita, Farm Fresh Pizza, Milkshakes), creating raw ingredient deficits (flour, mozzarella, tomatoes, onions, milk).
2. **An Autonomous Buyer Agent** scans wholesale supplier catalogs, broadcasts RFQs (Requests for Quote), negotiates volume-discount tiers, and splits purchases across vendors for optimal cost.
3. **A Pure-TypeScript Deterministic Policy Engine** acts as an uncompromisable gatekeeper (enforcing spend caps, unit price ceilings, and supplier allowlists) _before_ any payment is ever initiated.
4. **NPCI UPI Circle Governance** allows the restaurant owner to delegate spending autonomy:
   - **Full Autonomous Mode**: Instant payment capture within strict spend caps.
   - **Partial Autonomous Mode**: The agent negotiates the deal, but the owner must review and authorize the payment via their mobile device.
5. **Production Razorpay Integration**: Real Razorpay Orders API calls, idempotency state machine (`idemp_{orderId}_attempt_{n}`), timing-safe HMAC-SHA256 verified webhook reconciliation (`payment.captured` & `payment.failed`), and documented UPI test VPAs (`success@razorpay` vs. `failure@razorpay`).

---

## Architectural Overview

```
                          ┌────────────────────────┐
                          │  Customer Orders Queue │
                          │ (Margherita, Shake...) │
                          └───────────┬────────────┘
                                      │ Stock Deficit Detected
                                      ▼
                        ┌───────────────────────────┐
                        │    Buyer Agent: RazorSlice │
                        │  (Strategic Procurement)  │
                        └─────────────┬─────────────┘
                                      │ Broadcasts RFQs
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
       ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
       │   RazorPies   │      │  Razorcery #1 │      │  Razorcery #2 │
       │ (Cheese/Milk) │      │ (Flour/Tomato)│      │(Tomato/Onions)│
       └───────┬───────┘      └───────┬───────┘      └───────┬───────┘
               │ Dynamic Quotes       │ Volume Tiers │ Stock Limits
               └──────────────────────┼──────────────┘
                                      ▼
                       ┌─────────────────────────────┐
                       │  Best Deal / Split Proposed │
                       └──────────────┬──────────────┘
                                      │
                                      ▼
         ═════════════════════════════════════════════════════════
         LAYER 1: PRE-PAYMENT POLICY ENGINE (Deterministic Gate)
         ═════════════════════════════════════════════════════════
         [✓] Vendor on Allowlist?
         [✓] Price ≤ Per-Unit Ceiling (e.g. ≤ ₹35/kg)?
         [✓] Total Deal ≤ Per-Transaction Cap (₹1,600)?
         [✓] Rolling Spend ≤ Weekly Budget Cap (₹8,000)?
         [✓] Delegation Mode: Full vs. Partial?
                                      │
                     ┌────────────────┴────────────────┐
                     │ (Pass)                          │ (Breach)
                     ▼                                 ▼
         ┌───────────────────────┐         ┌───────────────────────┐
         │  Full Mode: Auto-Pass │         │  Partial / Violation: │
         │  Dispatch to Gateway  │         │  Escalate to Mobile   │
         └───────────┬───────────┘         │  Owner PIN Override   │
                     │                     └───────────┬───────────┘
                     │                                 │ (Owner Approves)
                     └────────────────┬────────────────┘
                                      ▼
         ═════════════════════════════════════════════════════════
         LAYER 2: IDEMPOTENCY-LOCKED GATEWAY DISPATCH
         ═════════════════════════════════════════════════════════
         • Generate Idempotency Key: idemp_{orderId}_attempt_1
         • Inject Header: x-razorpay-idempotency-key
         • Annotate Delegation Tag: upi_circle_simulated
         • Call Razorpay Orders & Payment Settlement APIs
                                      │
                     ┌────────────────┴────────────────┐
                     │                                 │
                     ▼                                 ▼
           [🟢 success@razorpay]              [🔴 failure@razorpay]
           • Authentic Payment Captured       • Bank Hard Decline
           • HMAC-SHA256 Signature Verified   • BAD_REQUEST_ERROR Logged
           • Order Status: "paid"             • Order Status: "attempted"
           • Restock Kitchen Pantry           • Inventory Holds Untouched
                     │                                 │
                     │                                 ▼
                     │                     ══════════════════════════════════
                     │                     LAYER 3: ASYNC WEBHOOK & RECOVERY
                     │                     ══════════════════════════════════
                     │                     • Fire HMAC Webhook (payment.failed)
                     │                     • Mobile Recovery Card Displays
                     │                     • 1-Tap: Fall back to Backup UPI
                     │                       (idemp_{orderId}_attempt_2)
                     ▼                     • 1-Tap: Cancel & Release Holds
         ┌───────────────────────┐                     │
         │  HMAC-SHA256 Webhook  │                     │
         │   payment.captured    │◄────────────────────┘
         └───────────────────────┘
```

---

## Core Features & Technical Highlights

### 1. Deterministic Guardrails: "The LLM Proposes, the Policy Engine Disposes"

- **Zero Direct Gateway Access:** The AI agent never touches a secret key, private token, or payment execution method directly.
- **Pure Mathematical Validation:** Evaluates 5 boundary checks:
  1. `within_per_transaction_cap` (Hard ₹1,600 ceiling).
  2. `within_weekly_budget` (Calculated against rolling 7-day spend).
  3. `seller_allowed` (Verifies supplier against pre-vetted allowlist).
  4. `unit_price_within_ceiling` (Prevents inflated ingredient rates).
  5. `delegation_mode` (Full vs. Partial governance).

### 2. NPCI UPI Circle Governance (Primary vs. Secondary Users)

- **Primary Account Holder:** The restaurant manager/owner who configures budgets and holds the delegated UPI mandate.
- **Secondary Delegated Entity:** The autonomous buyer agent (`agent:buyer:razorslice`).
- **Interactive Mobile Simulator:** A complete mobile device UI showing live budget meters, pending approval cards, one-tap approvals, and real-time webhook feeds.

### 3. Dynamic B2B Wholesale Market Dynamics

- **Session-Start Catalog Discovery:** Supplier base prices and volume-discount tiers are discovered and cached once at session start (just like wholesale rate cards), while live inventory availability is queried just-in-time per RFQ to avoid stale commitments.
- **Volume-for-Price Counter-Offers:** If a vendor quotes slightly above the buyer's ceiling, the buyer calculates the next quantity tier, increases batch volume, and counter-offers for a lower per-unit rate.
- **Multi-Seller Split Procurement:** If one vendor has insufficient stock or high prices, the buyer automatically splits the purchase across suppliers (e.g. 30kg from RazorPies at tier discount + 20kg from Razorcery #1) to hit the exact deficit at minimum total cost.
- **Menu-Aware Bundle & Upsell Gating:** If a seller tries to bundle surplus ingredients, the buyer cross-references the restaurant's active recipe book (Margherita, Farm Fresh, Milkshakes). Unneeded items trigger an automatic `UPSELL_DECLINE`.
- **Ground-Truth Scrubber:** A regex auditor scans LLM free-text reasoning to ensure every cited price or quantity matches verified tool data, completely eliminating hallucinated justifications.

---

## Production Failure Handling & Resilience Engine

Most agentic demos only show a scripted "happy path" using mock flags. RazorSlice is built like production banking infrastructure:

### 1. The Idempotency State Machine

- **Module:** [`server/src/payments/idempotencyManager.ts`](file:///D:/uni/a2a-razorpay-buildathon-project/server/src/payments/idempotencyManager.ts)
- **States:** `INITIATED` $\rightarrow$ `SETTLED` | `FAILED` | `RECONCILING`
- **Unified Identifier:** Scoped directly to the Razorpay Order ID:
  - Attempt 1: `idemp_{orderId}_attempt_1`
  - Attempt 2 (Recovery): `idemp_{orderId}_attempt_2`
- **Rule 1 (Same Key = Zero Duplicate Charges):** In network socket drops (`ECONNRESET`), reconnecting with the identical key causes the gateway to return the existing settled receipt without debiting the customer again.
- **Rule 2 (Hard Decline Fallback = Fresh Key):** When a bank declines authorization (`failure@razorpay`), retrying the same VPA would just return the old decline. The agent falls back to the buyer's registered backup payment instrument (`success@razorpay`) with a fresh scoped key (`attempt_2`).

### 2. Documented Razorpay Test Mode VPAs

- **Happy Path:** Uses `success@razorpay` to generate authentic captures and verify HMAC-SHA256 signatures (`razorpay_order_id|razorpay_payment_id`).
- **Bank Decline:** Uses `failure@razorpay` (Razorpay's official test UPI handle for declined authorizations). The API returns authentic diagnostics:
  - `error_code: "BAD_REQUEST_ERROR"`
  - `error_step: "payment_authorization"`
  - `error_source: "gateway"`
  - `error_reason: "payment_failed"`

### 3. Asynchronous Webhook Pipeline (`x-razorpay-signature`)

- **Module:** [`server/src/payments/webhookStore.ts`](file:///D:/uni/a2a-razorpay-buildathon-project/server/src/payments/webhookStore.ts)
- Real fintech workflows do not rely on browser tabs staying open. Razorpay asynchronously fires webhooks:
  - `payment.captured`
  - `payment.failed`
- Every webhook is cryptographically verified using Node's `crypto.timingSafeEqual` with HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`.
- Inspect all webhook events, headers, and raw JSON payloads live in the Mobile Phone's "Webhooks" tab.

### 4. Zero Accounting & Inventory Contradictions

- **Post-Capture State:** Order snapshots fetched after settlement reflect the true state: `"status": "paid", "amount_paid": amount, "amount_due": 0, "attempts": 1`.
- **Post-Decline State:** Order snapshots on failure reflect: `"status": "attempted", "amount_paid": 0, "amount_due": amount, "attempts": 1`.
- **Strict Inventory Protection:** Kitchen inventory is **never** decremented unless cryptographic payment capture has been confirmed.

---

## Repository Structure

```
a2a-razorpay-buildathon-project/
├── api/
│   └── index.ts                          # Vercel Serverless Function entry point (Express app)
├── vercel.json                           # Vercel deployment routing & monorepo build configuration
│
├── client/                               # Frontend (React + TypeScript + Vite + Tailwind)
│   ├── src/
│   │   ├── api/client.ts                 # Typed API client with automatic BYOK header injection
│   │   ├── components/
│   │   │   ├── ApiKeyModal.tsx           # BYOK Modal with live Razorpay connection test & secret masking
│   │   │   ├── Header.tsx                # App header with live BYOK status pill & key manager trigger
│   │   │   ├── RazorSliceArchitecture.tsx# Interactive kitchen canvas, seller catalogs, & resilience rail
│   │   │   ├── MobileDevice.tsx          # Smartphone simulator with PIN drawer, Recovery Card, & Webhook feed
│   │   │   └── EnvelopeTrace.tsx         # Full Explainability audit timeline for every A2A message
│   │   ├── utils/
│   │   │   └── keyStore.ts               # Zero-storage browser localStorage key manager & event bus
│   │   ├── types.ts                      # Shared TypeScript domain contracts
│   │   └── App.tsx                       # Main layout and scenario coordinators
│   └── package.json
│
├── server/                               # Backend (Node.js + Express + SQLite + Razorpay)
│   ├── src/
│   │   ├── agents/
│   │   │   ├── buyerAgent.ts             # Buyer agent with RFQ generation & counter-bargaining
│   │   │   ├── sellerAgent.ts            # Seller agent with tiered volume pricing logic
│   │   │   ├── pricingEngine.ts          # Deterministic wholesale pricing & bundle validation
│   │   │   └── negotiationPolicy.ts      # Strategic target pricing & ceiling calculations
│   │   ├── orchestrator/
│   │   │   ├── orchestrator.ts           # End-to-end A2A coordinator, resilience engine, & recovery
│   │   │   └── policyEngine.ts           # Pure-TypeScript deterministic financial guardrails
│   │   ├── payments/
│   │   │   ├── credentials.ts            # Per-request BYOK header parser (x-razorpay-*, x-gemini-*)
│   │   │   ├── razorpayClient.ts         # Ephemeral Razorpay instances, Orders API, & test VPAs
│   │   │   ├── idempotencyManager.ts     # Idempotency State Machine (Rule 1 & Rule 2)
│   │   │   ├── webhookStore.ts           # Cryptographic HMAC-SHA256 webhook ingestion & storage
│   │   │   └── failureHandling.test.ts   # Comprehensive resilience unit & integration tests
│   │   ├── routes/
│   │   │   ├── negotiate.ts              # Negotiation endpoints (/api/negotiate, /confirm)
│   │   │   └── payments.ts               # Payments, /verify-keys, webhook feed, & retry routes
│   │   ├── db/connection.ts              # SQLite connection with /tmp path & InMemory fallback for Vercel
│   │   ├── thread/threadStore.ts         # Append-only immutable envelope audit trail (event sourcing)
│   │   └── inventory/inventoryStore.ts   # SQLite-backed restaurant pantry & seller catalogs
│   └── package.json
│
├── my-files/                             # Design blueprints & architectural specifications
└── README.md                             # You are here!
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- _(Optional)_ Real Razorpay Test Keys (`RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`). The app includes an authentic built-in test simulator if keys are omitted.

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-username/a2a-razorpay-buildathon-project.git
cd a2a-razorpay-buildathon-project

# Install root dependencies
npm install

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
cd ..
```

### 2. Environment Configuration

Create a `.env` file in the project root:

```env
PORT=3001
# Optional: Add your Razorpay Test Mode keys below
RAZORPAY_KEY_ID=rzp_test_YourKeyIdHere
RAZORPAY_KEY_SECRET=YourKeySecretHere
RAZORPAY_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3. Running the Application

Open two terminal windows:

**Terminal 1 (Backend Server):**

```bash
cd server
npm run dev
# Server starts on http://localhost:3001
```

**Terminal 2 (Frontend Client):**

```bash
cd client
npm run dev
# Vite client starts on http://localhost:5173
```

---

## ☁️ Deploying to Vercel (Serverless Monorepo)

RazorSlice is configured out-of-the-box for 1-click monorepo deployment on **Vercel** with zero backend infrastructure management.

### Architecture on Vercel:
- **Unified Routing:** [`vercel.json`](file:///D:/uni/a2a-razorpay-buildathon-project/vercel.json) routes all `/api/*` requests to [`api/index.ts`](file:///D:/uni/a2a-razorpay-buildathon-project/api/index.ts) (running the Express app in a serverless Node.js runtime) and serves client assets from `client/dist`.
- **Lambda Storage Isolation:** SQLite automatically directs writes to `/tmp/a2a.db` with an instant in-memory fallback adapter, guaranteeing zero runtime crashes during serverless cold starts.
- **BYOK Statelessness:** Since keys are passed via HTTP headers and never stored on the server, a single public Vercel deployment can serve thousands of independent users safely.

### 1-Click Git Deployment:
1. Push your repository branch to GitHub:
   ```bash
   git push origin vercel-deployment
   ```
2. Navigate to [vercel.com/new](https://vercel.com/new) and select your repository.
3. Configure the project:
   - **Framework Preset:** `Vite` (or `Other`)
   - **Root Directory:** `./`
   - **Build Command:** `npm run vercel-build`
   - **Output Directory:** `client/dist`
4. *(Optional)* Add default server environment variables if you want to provide a fallback:
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
5. Click **Deploy**. Vercel will build both client and server and deploy to a live URL!

### Deploying via Vercel CLI:
```bash
# Link and preview deployment:
npx vercel

# Deploy directly to production:
npx vercel --prod
```

---

## Testing & Verification

The repository includes a comprehensive, automated test suite covering deterministic policies, catalog tier discovery, envelope auditing, payment signatures, idempotency, and failure recovery.

Run the test suite from the `server` directory:

```bash
cd server
npm test
```

### Test Suite Summary:

```text
✔ PolicyEngine (evaluateDeal)
  ✔ 1. Approves an offer that passes every check (Happy Path)
  ✔ 2. Rejects an offer that breaches per_transaction_cap (₹1,968 > ₹1,600)
  ✔ 3. Rejects an offer from a seller not on the allowlist
  ✔ 4. Rejects an offer that breaches weekly_budget_cap given non-zero weekSpentSoFar
  ✔ 5. Rejects an offer exceeding per_unit_price_ceiling (₹38/kg > ₹35/kg)
  ✔ 6. Returns RENEGOTIATE_OR_ESCALATE when delegation_mode is 'partial'

✔ razorpayClient (Payment Settlement & Cryptographic Verification)
  ✔ 1. creates an order in paise and returns order id and status 'created'
  ✔ 2. settlePayment captures payment, issues payment_id and verifies HMAC signature
  ✔ 3. verifyPaymentSignature validates authentic HMAC signature and rejects forged signature
  ✔ 4. verifyWebhookSignature validates authentic webhook body and rejects invalid secret
  ✔ 5. settlePayment with simulatePaymentFail rejects transaction with PAYMENT_GATEWAY_DECLINED

✔ Production Failure Handling, Idempotency & Webhooks
  ✔ Pillar A: IdempotencyManager enforces key formatting convention
  ✔ Pillar A: Rule 1 replay with SAME idempotency key returns cached receipt without double charge
  ✔ Pillar B: WebhookStore signs and verifies authentic payloads via HMAC-SHA256
  ✔ Pillar C: Scenario 1 (Bank Decline failure@razorpay) emits verified payment.failed webhook
  ✔ Pillar C: Rule 2 Recovery: retryFailedProcurement settles with fresh key attempt_2 and restocks kitchen
  ✔ Pillar C: Order Cancellation: cancelFailedProcurement releases pantry holds

ℹ tests 73
ℹ suites 13
ℹ pass 73
ℹ fail 0
```

To verify the frontend production bundle:

```bash
cd client
npm run build
# ✓ built in ~500ms with 0 errors
```

Created for the **Razorpay Buildathon — AI Growth & Agentic Commerce Track**.
