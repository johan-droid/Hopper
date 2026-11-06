# Hopper — Customer Discovery & Validation Interview Guide

**Document Status:** Approved Protocol for Customer Discovery  
**Author:** Principal Product Strategist & SaaS Financial Analyst  
**Date:** November 6, 2026  
**Target Sample:** 15 to 25 Engineering Leads, CTOs, and Senior Developers in India  
**Target Segments:**
1. Boutique Software Development Agencies (10–50 developers)
2. Early-Stage Funded Tech Startups (Seed to Series A, 3–15 developers)
3. Specialized Small Engineering Squads / Independent Dev Shops  
**Governance Constraint:** *Strictly NO fabricated responses. Real customer interview data must be collected following this guide and recorded into the companion results template.*

---

## 1. Objectives & Interview Architecture

The primary goal of customer discovery is to **validate customer pain, measure empirical failure volumes, and test price elasticity between ₹1,499 and ₹1,999 for the 5-seat Team plan** before finalizing public pricing.

```mermaid
flowchart LR
    A["Screening & Context (5m)"] --> B["Pain & Triage Audit (10m)"]
    B --> C["Economic Toil & Current Spend (5m)"]
    C --> D["Solution Walkthrough & Feature Ranking (5m)"]
    D --> E["Van Westendorp Price Sensitivity (10m)"]
    E --> F["Rejection & Churn Probing (5m)"]
```

- **Session Duration:** 35 to 45 minutes via Google Meet or Zoom.
- **Interviewer Posture:** Non-defensive, listening-first inquiry. Do not pitch or sell; investigate their current engineering reality.
- **Recording & Consent:** Request explicit permission to record audio/notes for product improvement.

---

## 2. Participant Screening & Persona Qualification

### 2.1 Ideal Interviewee Profiles
- **Profile A (Agency Tech Lead / VP Eng):** Manages 3 to 10 active client projects. Directly feels the pain of broken CI pipelines blocking client pull requests and delaying billable milestone sign-offs.
- **Profile B (Startup CTO / Founding Engineer):** 3 to 8 engineers, fast release cadence (daily or multi-daily deploys). Lacks a dedicated DevOps or Platform engineer; developers rotate triage duties.
- **Profile C (Senior Full-Stack Engineer / Dev Lead):** Senior IC responsible for PR reviews, test suite maintenance, and debugging CI build failures.

### 2.2 Screening Questions (Pre-Interview / Email)
1. "Does your team maintain continuous integration pipelines (GitHub Actions, GitLab CI, Bitbucket, CircleCI, or Jenkins) that run automated tests or builds on Pull Requests?" *(Must be YES)*
2. "How many developers regularly push code to these repositories?" *(Target: 3 to 25)*
3. "Are you involved in decisions regarding developer tooling or team software subscriptions?" *(Target: Yes or Influencer)*

---

## 3. Structured Interview Script

### Section 1: Workflow & CI Context (5 Minutes)
1. "Could you walk me through your team’s development workflow from writing code locally to deploying to staging/production?"
2. "Which CI/CD platforms are currently used across your active repositories?"
3. "How many active repositories does your engineering team maintain simultaneously?"
4. "On an average week, approximately how many pull requests does your team open and merge?"

### Section 2: Frequency & Pain of CI/CD Failures (10 Minutes)
*Goal: Quantify empirical failure frequency and the emotional/operational friction of broken builds.*
1. "Thinking back to the last 2 weeks, how often did a CI build or test run fail on a pull request?"
   - *Probe:* Is it 1–2 times a week, multiple times a day, or on almost every active PR?
2. "When a CI pipeline breaks, what are the most common failure causes you see?"
   - *Checklist for interviewer:*
     - [ ] Test assertion failure / Flaky tests
     - [ ] Dependency resolution / npm / lockfile mismatch
     - [ ] TypeScript / lint / formatting checks
     - [ ] Missing or misconfigured environment variables / secrets
     - [ ] Docker build context or container engine errors
     - [ ] Network timeouts / external package registry blips
     - [ ] Database migration or connection timeout
3. "Walk me through what happens the moment a build fails on a pull request: Who investigates it? What steps do they take?"
4. "Approximately how many minutes does an engineer spend reading raw CI logs to pinpoint the exact root cause?"
   - *Probe:* What is the difference between an easy fix (syntax/lint) and a difficult fix (docker/dependency/flakiness)?

### Section 3: Economic Cost of Engineering Toil & Tool Spending (5 Minutes)
*Goal: Measure the financial and productivity impact of triage toil.*
1. "In your estimate, how many engineering hours does your entire team lose each week just investigating and rerunning failing CI pipelines?"
2. "How does a broken CI build affect your sprint velocity or client delivery commitments?"
3. "What developer tools does your team currently pay for?"
   - *Probe:* GitHub Team, Jira, Linear, Sentry, Datadog, CircleCI, Cursor, Copilot, Docker Pro?
   - "Approximately what is your monthly budget per engineer or for the team on developer productivity tools?"

### Section 4: Hopper Solution Walkthrough & Value Realization (5 Minutes)
*Interviewer shares a 90-second mock PR screenshot or describes Hopper:*
> *"Imagine a bot integrated into your GitHub repository. The moment a CI build fails, it sanitizes your logs, analyzes the failure context, and within 5 seconds posts a concise comment directly on the PR showing: (1) The exact root cause, (2) The specific log lines with citations, (3) A shell command to reproduce and fix it locally, and (4) Whether this test has a history of being flaky."*

1. "Looking at this, what is your immediate reaction? How would this change your team's daily triage routine?"
2. "Between the root-cause diagnosis, the exact code/log quotes, the local repro command, and the flakiness history—which element is most valuable to you?"
3. "Would your team trust an automated recommendation if it provided verifiable quotes from your raw log file?"
4. "Would you want Hopper to suggest code fixes as pull request comments, or post into a Slack channel, or both?"

### Section 5: Price Sensitivity Testing (Van Westendorp Methodology) (10 Minutes)
*Context: We are evaluating the 5-developer Team Plan with 10 repositories and automated failure diagnoses.*

1. **Too Cheap Question:**
   - "At what monthly price for a 5-person team would you consider Hopper to be so cheap that you would question its quality or diagnostic accuracy?"
2. **Bargain Question:**
   - "At what monthly price would you consider Hopper to be a bargain—a great buy for the money that you'd sign up for immediately?"
3. **Getting Expensive Question (Price Resistance Threshold):**
   - "At what monthly price would you consider Hopper to be starting to get expensive, but you would still seriously consider purchasing it because of the time saved?"
4. **Too Expensive Question (Walkaway Threshold):**
   - "At what monthly price would Hopper be so expensive that you would not even consider buying it, regardless of the features?"

#### Direct Elasticity Probe: ₹1,499 vs ₹1,999
5. "If the Team plan is priced at **₹1,499 / month** for up to 5 developers:
   - Would you be able to expense this on a corporate credit card or petty cash without requiring higher-level CFO / management approval?
   - How likely would you be to start a 14-day trial at this price (Scale 1–10)?"
6. "If the Team plan were instead priced at **₹1,999 / month** (approximately \$24 USD):
   - Does that change your decision or procurement process in any way?
   - What would you need to see in the product to easily justify ₹1,999 over ₹1,499?"
7. "Would your team prefer paying monthly via UPI AutoPay / Credit Card, or would you prefer an annual upfront plan (e.g. ₹14,990/year with 2 months free) to receive a single B2B GST tax invoice?"

### Section 6: Rejection Triggers, Objections & Churn Risks (5 Minutes)
*Goal: Uncover hidden blockers, security objections, and fatal product flaws.*
1. "What would be the single biggest reason your team would **reject** Hopper or decide not to install it?"
   - *Probe:* Security/code access concerns, lack of trust in AI, too many bot comments on PRs, cost, lack of GitLab/Bitbucket support?
2. "What are your team's security requirements regarding CI log data? (e.g., automated credential scrubbing, zero-retention policies, on-premise deployment)?"
3. "If you installed Hopper today, what would cause you to uninstall or cancel it after 30 days?"
4. "Which integrations are absolute dealbreakers for you? (GitHub, GitLab, Bitbucket, Slack, Discord, Microsoft Teams, Jira)?"

---

## 4. Post-Interview Debrief & Scoring Rubric

Immediately following each interview, the interviewer must complete the quantitative scoring rubric in the companion template ([`CUSTOMER_INTERVIEW_TEMPLATE.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/strategy/CUSTOMER_INTERVIEW_TEMPLATE.md)):

```
+--------------------------------------------------------------------------------------------------+
|                                    INTERVIEW EVALUATION MATRIX                                   |
+--------------------------+---------------------+-------------------------------------------------+
| Dimension                | Rating Scale        | Definition                                      |
+--------------------------+---------------------+-------------------------------------------------+
| Problem Urgency          | 1 (Low) to 5 (High) | How acutely do they feel CI triage pain?        |
| Willingness to Pay       | 1 (Low) to 5 (High) | Readiness to commit ₹1,499 or ₹1,999?           |
| Security Friction        | 1 (Low) to 5 (High) | Sensitivity to log ingestion / AI processing?   |
| Referral / Pilot Desire  | Yes / Maybe / No    | Agreed to connect Hopper on pilot repo?         |
+--------------------------+---------------------+-------------------------------------------------+
```

