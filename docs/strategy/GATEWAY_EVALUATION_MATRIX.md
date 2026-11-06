# Hopper — Deferred Payment Gateway Evaluation Matrix (Razorpay vs Paddle)

**Document Status:** Research & Architectural Evaluation Only (Decision Deferred)  
**Author:** Principal Product Strategist & SaaS Financial Analyst  
**Date:** November 6, 2026  
**Candidate Gateways:** Razorpay (India Domestic Leader) vs Paddle (Global Merchant of Record)  
**Governance Directive:** *Do NOT make a final selection. Payment gateway implementation remains strictly deferred until customer discovery, pricing validation, and owner authorization are complete.*

---

## 1. Executive Summary & Evaluation Rationale

To support Hopper's **India-first launch with international expansion runway**, two primary payment platform architectures have been selected as candidates for deferred evaluation:

1. **Razorpay (Direct Gateway / Payment Aggregator):**
   - The dominant domestic B2B and SaaS payment processor in India.
   - Provides native support for **UPI AutoPay** and Indian credit/debit cards compliant with Reserve Bank of India (RBI) recurring e-mandate regulations.
   - Operates as a pure payment gateway: Hopper is the Merchant of Record and must handle domestic GST compliance, invoicing, and tax filing directly.
2. **Paddle (Merchant of Record - MoR):**
   - The leading global SaaS Merchant of Record platform.
   - Sells software on Hopper's behalf, assuming full legal, sales tax, VAT, and US state compliance liabilities worldwide.
   - Designed for frictionless international cross-border sales, but lacks domestic Indian payment primitives (such as UPI AutoPay) and incurs higher platform take-rates.

---

## 2. Comprehensive 8-Dimension Evaluation Matrix

```
+-------------------------------------------------------------------------------------------------------------------------+
|                                    GATEWAY EVALUATION: RAZORPAY VS PADDLE                                               |
+------------------------------------+-------------------------------------------+----------------------------------------+
| Evaluation Dimension               | Candidate A: Razorpay                     | Candidate B: Paddle                    |
+------------------------------------+-------------------------------------------+----------------------------------------+
| 1. Indian Subscription Support     | NATIVE & LEADING                          | LIMITED                                |
| 2. UPI & Domestic Card Support     | FULL (UPI AutoPay + Rupay/Visa/MC)        | CARDS ONLY (No UPI AutoPay)            |
| 3. Recurring Constraints (RBI)     | Turnkey RBI e-mandate engine (<₹15k AFA)  | Poor recurring success on Indian cards |
| 4. International Acceptance        | Secondary (Requires export underwriting)  | NATIVE & EXCELLENT (200+ currencies)   |
| 5. Merchant of Record (MoR)        | NO (Hopper is MoR; manages GST filings)   | YES (Paddle is MoR; manages global tax)|
| 6. Settlement & Refunds            | T+2 days to Indian bank in INR            | Monthly/Bi-weekly wire transfer in USD |
| 7. Fees & Tax Handling             | 2.0% + GST (Low take-rate)                | 5.0% + $0.50 (Includes MoR compliance) |
| 8. Business Eligibility            | Registered Indian Entity + GSTIN required | Global entity accepted (Stripe/Atlas)  |
+------------------------------------+-------------------------------------------+----------------------------------------+
```

---

## 3. Deep-Dive Dimensional Analysis

### Dimension 1: Indian Subscription Support
- **Razorpay Subscriptions:**
  - Built specifically for the Indian subscription economy.
  - Supports automated subscription cycles (weekly, monthly, yearly), trial periods, upfront setup fees, prorated upgrades, and automated retries on card renewal failures.
  - Native customer self-service portal for pausing, resuming, or canceling recurring mandates.
- **Paddle Subscriptions:**
  - Standard global SaaS subscription engine with proration, tier switching, and dunning workflows.
  - However, subscription infrastructure is optimized for international card schemes (Stripe/Adyen rails) and lacks localized subscription optimization for Indian banking protocols.

### Dimension 2: UPI & Domestic Card Ingress
- **Razorpay:**
  - **UPI AutoPay:** Full support for UPI recurring mandates via Google Pay, PhonePe, Paytm, CRED, and BHIM. This is critical in India, where UPI accounts for over 80% of digital payment volume.
  - **Cards:** Full native support for Indian credit cards, debit cards (including RuPay), and Netbanking across 50+ Indian banks.
- **Paddle:**
  - Does **not** support UPI or UPI AutoPay.
  - Supports Visa, MasterCard, American Express, Apple Pay, Google Pay, and PayPal.
  - Indian customers must possess an international-enabled credit or debit card. Domestic-only RuPay cards and domestic netbanking cannot be processed.

### Dimension 3: Recurring Payment Constraints & RBI E-Mandate Compliance
- **Regulatory Context:** The Reserve Bank of India enforces strict **e-mandate rules for recurring digital transactions**:
  - Requires Additional Factor of Authentication (AFA via OTP) during initial mandate registration.
  - Requires sending a pre-debit notification to the cardholder at least 24 hours prior to each recurring charge.
  - Transactions up to ₹15,000 per cycle execute automatically without subsequent OTP; transactions exceeding ₹15,000 require OTP verification for every debit.
- **Razorpay Implementation:**
  - 100% turnkey compliance with RBI circulars. Automatically sends pre-debit SMS/email notifications 24 hours before monthly subscription renewal and coordinates automatic debits under the ₹15,000 limit.
- **Paddle Implementation:**
  - Does not maintain direct integrations with Indian issuer pre-debit notification switches.
  - Recurring charges on Indian credit/debit cards frequently fail at renewal because Indian banks decline recurring cross-border debits that lack pre-debit notifications and 3DS compliance.

### Dimension 4: International Payment Acceptance & Global Runway
- **Razorpay:**
  - Can accept international credit cards (USD, EUR, GBP), but requires separate business underwriting and documentation (Import-Export Code / purpose codes).
  - Foreign card decline rates are higher than international gateways due to 3D Secure mismatches.
- **Paddle:**
  - Exceptional global reach. Natively accepts payments in 30+ currencies across 200+ countries with automated localized checkout displays, multi-currency pricing, and local payment methods (iDEAL, Sofort, Alipay).

### Dimension 5: Merchant of Record (MoR) Requirements
- **Razorpay (Not an MoR):**
  - Hopper is the seller of record.
  - Hopper is legally responsible for issuing tax-compliant invoices, collecting 18% GST from Indian B2B buyers, verifying buyer GSTINs for input tax credit, and filing monthly GSTR-1 and GSTR-3B tax returns.
  - If selling to international customers, Hopper must manage Foreign Inward Remittance Certificates (FIRC) and zero-rated export GST filings.
- **Paddle (Is an MoR):**
  - Paddle purchases the software license from Hopper and resells it to the end customer.
  - Paddle assumes 100% liability for collecting and remitting sales taxes, US state taxes, EU VAT, and UK VAT.
  - Hopper receives a single consolidated monthly royalty payout, dramatically simplifying accounting and eliminating cross-border tax compliance overhead.

### Dimension 6: Settlement & Refund Handling
- **Razorpay:**
  - **Settlement Timeline:** Standard T+2 business days direct settlement into Hopper's Indian bank account (Current Account) in INR.
  - **Instant Refunds:** Turnkey API-driven refunds credited back to the customer's UPI VPA or card within 5–7 business days (or instant via IMPS).
- **Paddle:**
  - **Settlement Timeline:** Consolidated monthly or bi-weekly wire transfer to Hopper's bank account in USD. Requires minimum payout threshold (\$100).
  - **Refunds:** Managed via Paddle dashboard or webhook API; foreign exchange fluctuations between transaction date and refund date may affect net amounts.

### Dimension 7: Fee Structure & Tax Considerations
- **Razorpay Fees:**
  - Domestic Cards, UPI, Netbanking: **2.00%** per successful transaction.
  - Plus 18% GST on the transaction fee: Effective cost = **2.36%**.
  - International Cards: **3.00% + ₹3** (+ GST).
  - No monthly maintenance or platform subscription fees for standard tier.
- **Paddle Fees:**
  - Standard SaaS Plan: **5.00% + \$0.50 USD** per transaction.
  - On a ₹1,499 (\$17.95 USD) Team subscription:
    $$\text{Paddle Fee} = (\$17.95 \times 0.05) + \$0.50 = \$0.8975 + \$0.50 = \mathbf{\$1.3975\text{ USD (~₹116.69 INR)}} = \mathbf{7.78\%\text{ effective take-rate}}$$
  - *Comparison:* Razorpay fee on ₹1,499 is ₹35.38 (2.36%), whereas Paddle fee is ₹116.69 (7.78%). Paddle is ~3.3x more expensive per transaction, but that premium covers global sales tax filing.

### Dimension 8: Business Eligibility & Regulatory Onboarding
- **Razorpay Requirements:**
  - Requires a registered business entity in India (Private Limited Company, LLP, or Sole Proprietorship).
  - Requires Indian bank Current Account, Company PAN, Founder KYC, and GSTIN (for B2B invoicing).
  - Onboarding approval typically takes 3 to 7 business days.
- **Paddle Requirements:**
  - Accepts registered entities globally (including US C-Corps, UK Ltd, or Indian entities with export documentation).
  - Requires a live SaaS product with active terms of service, refund policy, and domain ownership verification.
  - Does not require Indian GST registration to operate, since Paddle acts as the reseller.

---

## 4. Architectural Readiness & Phased Recommendation (For Future Activation)

While a final selection is explicitly deferred, the architectural findings suggest a **Two-Phase Hybrid Deployment Model** when the billing milestone is authorized:

```mermaid
flowchart TD
    subgraph Phase A ["Phase A: Domestic India Launch (Target: Month 1–6)"]
        A1["Primary Gateway: RAZORPAY"]
        A2["UPI AutoPay + Domestic Cards"]
        A3["Turnkey RBI E-Mandate Compliance"]
        A4["Native 15-digit B2B GSTIN Invoicing"]
        A5["Effective Transaction Cost: 2.36%"]
    end

    subgraph Phase B ["Phase B: International Expansion (Target: Month 6+)"]
        B1["Expansion Gateway: PADDLE (Merchant of Record)"]
        B2["US / EU / Global Currency Checkout (USD/EUR)"]
        B3["Global VAT & US State Sales Tax Shield"]
        B4["Zero Overseas Tax Filings for Hopper"]
        B5["Effective Transaction Cost: 5% + $0.50"]
    end

    Phase A -.->|"Upon International Traffic Threshold"| Phase B
```

### Architectural Next Steps (Post-Validation Gate):
1. **Never build a gateway-locked data model:** Design Hopper's database schema around generic entities (`subscriptions`, `subscription_items`, `payment_providers`, `invoices`) with a provider enum (`'razorpay' | 'paddle' | 'mock'`), ensuring zero vendor lock-in.
2. **Abstract Webhook Ingress:** Maintain a normalized billing service interface (`backend/src/lib/billing/billing-service.interface.ts`) capable of routing events from either gateway into a unified workspace entitlement ledger.
3. **Formal Owner Gate:** Present live sandbox proofs to the owner for formal approval before provisioning production API keys.

