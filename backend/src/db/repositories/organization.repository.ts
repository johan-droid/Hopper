/**
 * Organization Data Access Repository.
 * Handles tenant lifecycle, GitHub installation mappings, and plan quota counters.
 */

import { DatabaseExecutor, getDatabaseExecutor } from '../client.js';
import { Organization, PlanTier, UpsertOrganizationInput } from '../types.js';

export class OrganizationRepository {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async findById(id: string): Promise<Organization | null> {
    const res = await this.db.query<Organization>(
      'SELECT * FROM organizations WHERE id = $1 LIMIT 1',
      [id]
    );
    return res.rows[0] || null;
  }

  async findByGithubInstallationId(installationId: number): Promise<Organization | null> {
    const res = await this.db.query<Organization>(
      'SELECT * FROM organizations WHERE github_installation_id = $1 LIMIT 1',
      [installationId]
    );
    return res.rows[0] || null;
  }

  async findByLogin(login: string): Promise<Organization | null> {
    const res = await this.db.query<Organization>(
      'SELECT * FROM organizations WHERE github_account_login = $1 LIMIT 1',
      [login]
    );
    return res.rows[0] || null;
  }

  async findByStripeCustomerId(customerId: string): Promise<Organization | null> {
    const res = await this.db.query<Organization>(
      'SELECT * FROM organizations WHERE stripe_customer_id = $1 LIMIT 1',
      [customerId]
    );
    return res.rows[0] || null;
  }

  async findByStripeSubscriptionId(subscriptionId: string): Promise<Organization | null> {
    const res = await this.db.query<Organization>(
      'SELECT * FROM organizations WHERE stripe_subscription_id = $1 LIMIT 1',
      [subscriptionId]
    );
    return res.rows[0] || null;
  }

  async upsert(input: UpsertOrganizationInput): Promise<Organization> {
    const defaultLimit =
      input.monthlyRunLimit ??
      (input.plan === 'team' ? 1000 : input.plan === 'pro_dev' ? 250 : 30);

    const sql = 'INSERT INTO organizations (github_installation_id, github_account_login, github_account_type, plan, monthly_run_limit) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (github_installation_id) DO UPDATE SET github_account_login = EXCLUDED.github_account_login, github_account_type = EXCLUDED.github_account_type, updated_at = NOW() RETURNING *';

    const res = await this.db.query<Organization>(sql, [
      input.githubInstallationId,
      input.githubAccountLogin,
      input.githubAccountType,
      input.plan || 'free',
      defaultLimit,
    ]);

    return res.rows[0];
  }

  async incrementRunsUsed(orgId: string): Promise<Organization> {
    const sql = 'UPDATE organizations SET runs_used_this_period = runs_used_this_period + 1, updated_at = NOW() WHERE id = $1 RETURNING *';
    const res = await this.db.query<Organization>(sql, [orgId]);
    if (!res.rows[0]) {
      throw new Error(`Organization with id ${orgId} not found`);
    }
    return res.rows[0];
  }

  async resetBillingPeriod(orgId: string): Promise<Organization> {
    const sql = 'UPDATE organizations SET runs_used_this_period = 0, billing_period_reset_at = NOW() + INTERVAL \'30 days\', updated_at = NOW() WHERE id = $1 RETURNING *';
    const res = await this.db.query<Organization>(sql, [orgId]);
    if (!res.rows[0]) {
      throw new Error(`Organization with id ${orgId} not found`);
    }
    return res.rows[0];
  }

  async updateSlackWebhook(orgId: string, slackWebhookUrl: string | null): Promise<Organization> {
    const sql = 'UPDATE organizations SET slack_webhook_url = $2, updated_at = NOW() WHERE id = $1 RETURNING *';
    const res = await this.db.query<Organization>(sql, [orgId, slackWebhookUrl]);
    if (!res.rows[0]) {
      throw new Error(`Organization with id ${orgId} not found`);
    }
    return res.rows[0];
  }

  async updateDiscordWebhook(orgId: string, discordWebhookUrl: string | null): Promise<Organization> {
    const sql = 'UPDATE organizations SET discord_webhook_url = $2, updated_at = NOW() WHERE id = $1 RETURNING *';
    const res = await this.db.query<Organization>(sql, [orgId, discordWebhookUrl]);
    if (!res.rows[0]) {
      throw new Error(`Organization with id ${orgId} not found`);
    }
    return res.rows[0];
  }

  async updateAutoRetryPolicy(orgId: string, autoRetryPolicy: boolean): Promise<Organization> {
    const sql = 'UPDATE organizations SET auto_retry_policy = $2, updated_at = NOW() WHERE id = $1 RETURNING *';
    const res = await this.db.query<Organization>(sql, [orgId, autoRetryPolicy]);
    if (!res.rows[0]) {
      throw new Error(`Organization with id ${orgId} not found`);
    }
    return res.rows[0];
  }

  async updatePlan(orgId: string, plan: PlanTier, monthlyLimit: number, stripeCustomerId: string | null = null, stripeSubscriptionId: string | null = null): Promise<Organization> {
    const sql = 'UPDATE organizations SET plan = $2, monthly_run_limit = $3, stripe_customer_id = COALESCE($4, stripe_customer_id), stripe_subscription_id = COALESCE($5, stripe_subscription_id), updated_at = NOW() WHERE id = $1 RETURNING *';
    const res = await this.db.query<Organization>(sql, [orgId, plan, monthlyLimit, stripeCustomerId, stripeSubscriptionId]);
    if (!res.rows[0]) {
      throw new Error(`Organization with id ${orgId} not found`);
    }
    return res.rows[0];
  }
}
