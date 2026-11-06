# Hopper — Diagnosis Quota Sustainability & Calibration Recommendations

**Document Status:** Approved Engineering & Commercial Recommendations  
**Author:** Principal Product Strategist & SaaS Financial Analyst  
**Date:** November 6, 2026  
**Scope:** Evaluation of Provisional Quotas across Community, Developer, Team, and Growth tiers  
**Target Repository:** [`/home/ashutoshsahoo/Downloads/Hopper`](file:///home/ashutoshsahoo/Downloads/Hopper)

---

## 1. Executive Summary

Hopper's initial strategy proposal defined provisional monthly AI diagnosis quotas:
- **Community:** 30 diagnoses / month (Free)
- **Developer:** 250 diagnoses / month (₹699)
- **Team:** 1,000 diagnoses / month (₹1,499 / ₹1,999)
- **Growth:** 3,500 diagnoses / month (₹3,999)

This analysis evaluates the **economic sustainability, operational risk, and margin impact** of each provisional quota against the audited AI cost of **\$0.007085 / run** (Anthropic Claude 3.5 Haiku with 8% retry overhead and uncached tokens) and the **$500 monthly global spending ceiling**.

### Core Verdict
1. **Developer Tier (250 runs):** **Highly Sustainable.** Yields 70.8% to 79.2% gross margins.
2. **Community Tier (30 runs):** **Uncontrolled Drag Risk.** If unmonetized free signups scale, 30 free runs will rapidly exhaust the platform's $500 global budget.
3. **Team Tier (1,000 runs):** **Over-Subscribed & Margin-Depressed.** At ₹1,499, 1,000 runs drops margins to 42.4% (100% util) and 58.2% (60% util) while limiting platform capacity to only 50 workspaces under the $500 cap.
4. **Growth Tier (3,500 runs):** **Severely Unsustainable at ₹3,999.** Consumes over 51% of gross revenue in raw AI costs at 100% utilization, dropping gross margins to 38.4%.

---

## 2. In-Depth Sustainability Analysis by Tier

### 2.1 Community Tier (Free / ₹0)
- **Provisional Limit:** 30 AI diagnoses / month.
- **Cost Analysis:**
  - AI variable cost: $30 \times \$0.007085 = \mathbf{\$0.213\text{ USD}}$ (~₹17.75 INR) per active user.
  - Storage & DB allocation: \$0.100 USD (~₹8.35 INR).
  - Total monthly cash burn per active free user: **\$0.313 USD (~₹26.10 INR)**.
- **Sustainability Assessment:**
  - If 500 open-source developers sign up and consume their 30 diagnoses, they consume **\$106.28 USD / month** — over **21.2% of Hopper's entire $500 global AI budget** while generating ₹0 revenue.
  - If 1,500 free users sign up, they completely exhaust the $500 ceiling, locking out paying customers.
- **Recommendation:**
  - **Calibrate Community quota to 15 AI diagnoses / month** (with unlimited deterministic pattern diagnoses).
  - *Rationale:* 15 AI diagnoses is more than sufficient for an open-source builder or developer evaluating Hopper across 3 to 5 PRs, while cutting free-tier infrastructure drain by 50%.

---

### 2.2 Developer Tier (₹699 / ~$8.37 USD)
- **Provisional Limit:** 250 AI diagnoses / month.
- **Cost Analysis:**
  - At 60% utilization (150 runs): AI cost = \$1.06 (₹88.50). Gateway fee = ₹16.50. Storage = ₹30.00. Total COGS = ₹135.00.
    - **Gross Profit:** ₹564.00 $\to$ **Gross Margin: 80.7%**.
  - At 100% utilization (250 runs): AI cost = \$1.77 (₹147.80). Gateway fee = ₹16.50. Storage = ₹30.00. Total COGS = ₹194.30.
    - **Gross Profit:** ₹504.70 $\to$ **Gross Margin: 72.2%**.
- **Sustainability Assessment:**
  - **Exemplary unit economics.** Even under 100% adversarial quota exhaustion, the Developer tier exceeds the 70% gross margin target.
- **Recommendation:**
  - **Maintain Developer quota at 250 diagnoses / month.**
  - No calibration required.

---

### 2.3 Team Tier (The Core Commercial Wedge)
- **Provisional Limit:** 1,000 AI diagnoses / month.
- **Evaluated Price Points:** ₹1,499 versus ₹1,999.
- **Cost Analysis:**
  - At 100% utilization (1,000 runs): AI cost alone is **\$7.085 USD (~₹591.60 INR)**.
  - Against a ₹1,499 price point, AI alone consumes **39.5% of gross revenue**. When combined with payment processing (₹35.38) and infrastructure/storage (₹150.30), fully loaded COGS reaches ₹863.40, causing gross margin to plummet to **42.4%**.
  - Furthermore, 1,000 runs per team forces an aggressive over-subscription ratio against the $500 AI cap, restricting the platform to just 50 safe workspaces.

#### Evaluation of Team Quota Calibration Options:

| Quota Option | Monthly Price | Monthly AI Quota | Daily Run Avg (22 workdays) | AI Cost @ 60% Util | Fully Loaded Margin @ 60% | AI Cost @ 100% Util | Fully Loaded Margin @ 100% | Safe Workspaces Under $500 Cap |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Option 1 (Current Proposal)** | ₹1,499 | 1,000 runs | 45 runs/day | ₹354.96 | 58.2% | ₹591.60 | 42.4% | 50 workspaces |
| **Option 2 (Right-Sized Team)** | **₹1,499** | **600 runs** | **27 runs/day** | **₹212.98** | **67.7%** | **₹354.96** | **58.2%** | **83 workspaces** |
| **Option 3 (Balanced Team)** | **₹1,499** | **750 runs** | **34 runs/day** | **₹266.22** | **64.1%** | **₹443.70** | **52.2%** | **67 workspaces** |
| **Option 4 (Premium Wedge)** | **₹1,999** | **750 runs** | **34 runs/day** | **₹266.22** | **72.4%** | **₹443.70** | **63.5%** | **67 workspaces** |
| **Option 5 (Full Quota Premium)**| **₹1,999** | **1,000 runs** | **45 runs/day** | **₹354.96** | **68.1%** | **₹591.60** | **56.2%** | **50 workspaces** |

- **Recommendation:**
  - **Strategy A (If customer discovery validates ₹1,999):** Maintain **750 to 1,000 AI diagnoses / month** at ₹1,999. This guarantees 68% to 72% gross margins and aligns with international pricing parity.
  - **Strategy B (If customer discovery confirms ₹1,499 as the price ceiling):** Calibrate quota to **600 to 750 AI diagnoses / month**. 600 diagnoses provides ~27 diagnoses per working day—more than enough for a 5-developer squad—while restoring margins to ~68% and expanding cluster capacity by 66%.

---

### 2.4 Growth Tier (₹3,999 / ~$47.89 USD)
- **Provisional Limit:** 3,500 AI diagnoses / month.
- **Cost Analysis:**
  - At 100% utilization (3,500 runs): AI cost alone is $3,500 \times \$0.007085 = \mathbf{\$24.80\text{ USD}}$ (**₹2,070.59 INR**).
  - Against a ₹3,999 price point, AI consumes **51.8% of gross revenue**.
  - Adding gateway fee (₹94.38) and multi-repo storage/indexing (₹300.00), direct COGS is ₹2,464.97, leaving gross margin at an unsustainable **38.4%**.
  - Even at 60% utilization (2,100 runs), fully loaded gross margin is only **59.1%**.
- **Recommendation:**
  - **Recalibrate Growth Tier to either:**
    1. **₹3,999 with 2,500 diagnoses / month:** At 60% utilization (1,500 runs), AI cost is \$10.63 (₹887.60). Direct gross margin reaches **67.5%**.
    2. **Increase price to ₹4,999 for 3,500 diagnoses / month:** Restores gross margins to **68.2%** at 60% utilization.

---

## 3. Recommended Provisional Quota Matrix

Based on financial modeling and operational capacity constraints, Hopper recommends adopting the calibrated tier structure below for customer validation:

```
+--------------------------------------------------------------------------------------------------+
|                            RECOMMENDED CALIBRATED TIERS (VALIDATION)                             |
+---------------+---------------+--------------------+---------------------+-----------------------+
| Tier          | Monthly Price | Provisional Quota  | Recommended Quota   | Core Rationale        |
+---------------+---------------+--------------------+---------------------+-----------------------+
| Community     | Free (₹0)     | 30 AI runs         | **15 AI runs**      | Halves free budget    |
|               |               |                    |                     | drag on $500 ceiling  |
+---------------+---------------+--------------------+---------------------+-----------------------+
| Developer     | ₹699          | 250 AI runs        | **250 AI runs**     | Margin >70% verified; |
|               |               |                    |                     | healthy unit econ     |
+---------------+---------------+--------------------+---------------------+-----------------------+
| Team          | ₹1,499        | 1,000 AI runs      | **600 – 750 AI runs**| Restores margins to   |
| (Option 1)    |               |                    |                     | 64% - 68%; expands cap|
+---------------+---------------+--------------------+---------------------+-----------------------+
| Team          | ₹1,999        | 1,000 AI runs      | **750 – 1,000 runs**| Targets 70%+ margins; |
| (Option 2)    |               |                    |                     | primary test candidate|
+---------------+---------------+--------------------+---------------------+-----------------------+
| Growth        | ₹3,999        | 3,500 AI runs      | **2,500 AI runs**   | Eliminates 51% AI cost|
|               |               |                    |                     | ratio; preserves margin|
+---------------+---------------+--------------------+---------------------+-----------------------+
```

*Final confirmation of these quotas will be determined during the 15–25 customer discovery interviews by measuring actual weekly CI failure rates in target Indian software teams.*

