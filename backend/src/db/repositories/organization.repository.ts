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

  async findByWorkspaceId(workspaceId: string): Promise<Organization[]> {
    const res = await this.db.query<Organization>(
      'SELECT * FROM organizations WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );
    return res.rows;
  }

  async linkWorkspace(orgId: string, workspaceId: string): Promise<Organization> {
    const sql = `
      UPDATE organizations
      SET workspace_id = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.db.query<Organization>(sql, [orgId, workspaceId]);
    if (!res.rows[0]) {
      throw new Error(`Organization with id ${orgId} not found`);
    }

    // Also update all existing repositories for this organization to link to this workspace
    await this.db.query(
      'UPDATE repositories SET workspace_id = $2 WHERE org_id = $1 AND workspace_id IS NULL',
      [orgId, workspaceId]
    );

    return res.rows[0];
  }

  async upsert(input: UpsertOrganizationInput): Promise<Organization> {
    const defaultLimit =
      input.monthlyRunLimit ??
      (input.plan === 'team' ? 1000 : input.plan === 'pro_dev' ? 250 : 30);

    const sql = `
      INSERT INTO organizations (
        github_installation_id,
        github_account_login,
        github_account_type,
        plan,
        monthly_run_limit,
        workspace_id,
        installation_status,
        permissions,
        repository_selection
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (github_installation_id)
      DO UPDATE SET
        github_account_login = EXCLUDED.github_account_login,
        github_account_type = EXCLUDED.github_account_type,
        installation_status = EXCLUDED.installation_status,
        permissions = COALESCE(EXCLUDED.permissions, organizations.permissions),
        repository_selection = COALESCE(EXCLUDED.repository_selection, organizations.repository_selection),
        workspace_id = COALESCE(EXCLUDED.workspace_id, organizations.workspace_id),
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await this.db.query<Organization>(sql, [
      input.githubInstallationId,
      input.githubAccountLogin,
      input.githubAccountType,
      input.plan || 'free',
      defaultLimit,
      input.workspaceId ?? null,
      (input as any).installationStatus || 'active',
      JSON.stringify((input as any).permissions || {}),
      (input as any).repositorySelection || 'all',
    ]);

    return res.rows[0];
  }

  async updateInstallationStatus(
    installationId: number,
    status: 'active' | 'suspended' | 'deleted',
    metadata: {
      permissions?: any;
      repositorySelection?: string;
    } = {}
  ): Promise<Organization | null> {
    const isSuspended = status === 'suspended';
    const sql = `
      UPDATE organizations
      SET 
        installation_status = $2,
        suspended_at = CASE WHEN $3 = TRUE THEN NOW() ELSE NULL END,
        permissions = COALESCE($4, permissions),
        repository_selection = COALESCE($5, repository_selection),
        updated_at = NOW()
      WHERE github_installation_id = $1
      RETURNING *;
    `;

    const res = await this.db.query<Organization>(sql, [
      installationId,
      status,
      isSuspended,
      metadata.permissions ? JSON.stringify(metadata.permissions) : null,
      metadata.repositorySelection || null,
    ]);

    return res.rows[0] || null;
  }

  async recordAuditEvent(params: {
    organizationId?: string | null;
    installationId?: number | null;
    eventType: string;
    actorLogin?: string | null;
    details?: any;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      const sql = `
        INSERT INTO github_integration_audit_events (
          organization_id, installation_id, event_type, actor_login, details, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6);
      `;
      await this.db.query(sql, [
        params.organizationId || null,
        params.installationId || null,
        params.eventType,
        params.actorLogin || null,
        JSON.stringify(params.details || {}),
        params.ipAddress || null,
      ]);
    } catch {
      // Non-fatal if offline
    }
  }

  /**
   * Atomic TOCTOU-safe run quota reservation.
   * Atomically resets expired billing period and increments runs_used_this_period IF AND ONLY IF current runs < limit.
   */
  async tryReserveRunQuota(
    orgId: string,
    limit: number
  ): Promise<{ allowed: boolean; runsUsed: number }> {
    // 1. Advance expired billing period concurrency-safely
    try {
      await this.db.query(
        `UPDATE organizations
         SET runs_used_this_period = 0,
             billing_period_reset_at = NOW() + INTERVAL '30 days',
             updated_at = NOW()
         WHERE id = $1 AND billing_period_reset_at IS NOT NULL AND billing_period_reset_at <= NOW()`,
        [orgId]
      );
    } catch {
      // Ignore if column or schema is in mock mode
    }

    // 2. Atomically increment if usage < limit
    const sql = `
      UPDATE organizations
      SET runs_used_this_period = runs_used_this_period + 1, updated_at = NOW()
      WHERE id = $1 AND runs_used_this_period < $2
      RETURNING runs_used_this_period;
    `;
    const res = await this.db.query<{ runs_used_this_period: number }>(sql, [orgId, limit]);
    if (res.rows.length > 0) {
      return { allowed: true, runsUsed: Number(res.rows[0].runs_used_this_period) };
    }

    // Query current count if not updated (either cap reached or missing org)
    const org = await this.findById(orgId);
    return {
      allowed: false,
      runsUsed: org ? Number(org.runs_used_this_period) : limit,
    };
  }

  /**
   * Releases an unused quota reservation if an event was skipped or aborted before diagnosis.
   */
  async releaseRunQuota(orgId: string): Promise<void> {
    const sql = `
      UPDATE organizations
      SET runs_used_this_period = GREATEST(0, runs_used_this_period - 1), updated_at = NOW()
      WHERE id = $1;
    `;
    await this.db.query(sql, [orgId]);
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
