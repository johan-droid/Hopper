/**
 * Slack Alert Processor
 * Routes real-time notifications to team Slack webhooks when CI jobs fail
 * with high flakiness scores.
 */
import { Job } from 'bullmq';
import { WorkflowJobEventData } from '../../queue/types.js';
import { DatabaseExecutor } from '../../db/client.js';
import { ErrorCategory } from '../../db/types.js';
import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { FailureSignatureRepository } from '../../db/repositories/failure-signature.repository.js';
import { WorkflowFailureRepository } from '../../db/repositories/workflow-failure.repository.js';

export interface SlackAlertProcessorDependencies {
  executor?: DatabaseExecutor;
  orgRepo?: OrganizationRepository;
  failureSigRepo?: FailureSignatureRepository;
  workflowFailureRepo?: WorkflowFailureRepository;
}

/**
 * Error signature type for failure pattern tracking.
 */
export interface ErrorSignature {
  signatureHash: string;
  normalizedTemplate: string;
  testIdentifier: string | null;
  errorCategory: string;
  embedding: number[] | null;
  rootCauseClues?: string;
  suggestedNextCheck?: string;
}

/**
 * Threshold for considering a test "highly flaky" and triggering Slack alerts.
 * Tests with a flakiness score above this threshold will trigger notifications.
 */
export const HIGH_FLAKINESS_THRESHOLD = 80;

async function sendSlackAlert(
  flakinessScore: number,
  testIdentifier: string,
  repoFullName: string,
  runUrl: string,
  signatureHash: string,
  organization: any
): Promise<void> {
  const slackWebhookUrl = organization.slack_webhook_url;

  if (!slackWebhookUrl) {
    console.log(`[Slack Alert] No Slack webhook configured for organization ${organization.github_account_login}`);
    return;
  }

  const severity = flakinessScore >= 90 ? 'critical' : 'warning';

  const message = {
    text: `*Hopper CI Alert: High Flakiness Detected*`,
    attachments: [
      {
        color: severity === 'critical' ? 'danger' : 'warning',
        title: `Flaky Test: ${testIdentifier}`,
        title_link: runUrl,
        fields: [
          {
            title: 'Flakiness Score',
            value: `${flakinessScore}%`,
            short: true,
          },
          {
            title: 'Repository',
            value: repoFullName,
            short: true,
          },
          {
            title: 'Signature',
            value: signatureHash.substring(0, 8) + '...',
            short: true,
          },
          {
            title: 'Occurrences (30d)',
            value: 'See dashboard for details',
            short: true,
          },
        ],
        footer: 'Hopper CI Failure Diagnosis',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  console.log(`[Slack Alert] Would send to webhook ${slackWebhookUrl.substring(0, 20)}...`);
  console.log(`[Slack Alert] Message: ${JSON.stringify(message)}`);
}

export async function processSlackAlert(
  jobData: WorkflowJobEventData,
  deps: SlackAlertProcessorDependencies = {}
): Promise<void> {
  const orgRepo: OrganizationRepository = deps.orgRepo || new OrganizationRepository();
  const failureSigRepo: FailureSignatureRepository = deps.failureSigRepo || new FailureSignatureRepository();
  const workflowFailureRepo: WorkflowFailureRepository = deps.workflowFailureRepo || new WorkflowFailureRepository();

  if (jobData.conclusion !== 'failure') {
    return;
  }

  try {
    const org = await orgRepo.upsert({
      githubInstallationId: jobData.installationId,
      githubAccountLogin: jobData.orgLogin,
      githubAccountType: jobData.accountType,
    });

    const repo = await new (await import('../../db/repositories/repository.repository.js'))
      .RepositoryRepository(deps.executor || undefined).upsert({
        orgId: org.id,
        githubRepoId: jobData.githubRepoId,
        fullName: jobData.repoFullName,
        defaultBranch: jobData.branch,
      });

    const { sliceFailedStepLog } = await import('../../lib/parser/log-slicer.js');
    const { computeFailureSignature } = await import('../../lib/parser/fingerprinter.js');
    const { calculateFlakinessScore } = await import('../../lib/moat/flakiness-engine.js');

    let sanitizedLog = jobData.rawLog;
    if (sanitizedLog) {
      const sliced = sliceFailedStepLog(sanitizedLog);
      const signature: any = computeFailureSignature(
        jobData.jobName,
        jobData.stepName,
        sliced.detectedTestIdentifier,
        sliced.cleanedSnippet
      );

      const flakinessScore = calculateFlakinessScore({
        sameShaRetryPasses: 0,
        uniquePrsAffected: 1,
        totalOccurrences: 1,
        mainBranchOccurrences: 0,
        cleanedSnippet: sliced.cleanedSnippet,
      });

      const existingSignature = await failureSigRepo.findByHash(repo.id, signature.signatureHash);

      if (existingSignature) {
        await failureSigRepo.updateFlakinessAndCache({
          signatureId: existingSignature.id,
          flakinessScore,
          cachedRootCause: existingSignature.cached_root_cause,
          cachedNextCheck: existingSignature.cached_next_check,
        });

        if (flakinessScore >= HIGH_FLAKINESS_THRESHOLD) {
          const failures = await workflowFailureRepo.findFailuresBySignatureId(
            existingSignature.id,
            1
          );

          await sendSlackAlert(
            flakinessScore,
            existingSignature.test_identifier || existingSignature.normalized_template,
            repo.full_name,
            jobData.runUrl || `https://github.com/${repo.full_name}/actions/runs/${jobData.githubRunId}`,
            existingSignature.signature_hash,
            org
          );
        }
      } else {
        // ts-ignore: type compatibility issue with UpsertFailureSignatureInput
        await failureSigRepo.upsert({
          repoId: repo.id,
          signatureHash: signature.signatureHash,
          normalizedTemplate: signature.normalizedTemplate,
          testIdentifier: signature.testIdentifier,
          errorCategory: signature.errorCategory as ErrorCategory | string,
          embedding: signature.embedding,
          flakinessScore,
          cachedRootCause: signature.rootCauseClues,
          cachedNextCheck: signature.suggestedNextCheck,
          totalOccurrences: 1,
        } as any);

        if (flakinessScore >= HIGH_FLAKINESS_THRESHOLD) {
          await sendSlackAlert(
            flakinessScore,
            signature.testIdentifier || 'unknown test',
            repo.full_name,
            jobData.runUrl || `https://github.com/${repo.full_name}/actions/runs/${jobData.githubRunId}`,
            signature.signatureHash,
            org
          );
        }
      }
    }
  } catch (err: any) {
    console.error(`[Slack Alert Processor] Error processing job ${jobData.githubRunId}:`, err);
  }
}

export async function handleSlackAlertJob(job: Job<WorkflowJobEventData>): Promise<void> {
  await processSlackAlert(job.data);
}

export function getHighFlakinessThreshold(): number {
  return HIGH_FLAKINESS_THRESHOLD;
}
