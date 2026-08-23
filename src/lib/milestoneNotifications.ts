/**
 * Fires a push notification for a real product milestone — welcome,
 * first run ever finished, a genuinely beaten personal record — by asking
 * `client-actions` to send one (see its own `MILESTONE_MESSAGES`/
 * `sendMilestoneNotification`). The actual title/body text lives
 * server-side on purpose: this call can only ever trigger one of a fixed
 * set of messages, sent only to the caller's own account, never arbitrary
 * text to anyone.
 *
 * Fire-and-forget by design — every call site here is a "nice to notice
 * this happened" moment, not something the run/onboarding flow should ever
 * wait on or show an error for. No-ops with no Appwrite configured or no
 * signed-in account, same convention as the rest of this app.
 */
import { ExecutionMethod } from "appwrite";
import { CLIENT_ACTIONS_FUNCTION_ID, getAppwrite } from "./appwrite";

export type Milestone = "boas-vindas" | "primeira-corrida" | "novo-recorde";

export function sendMilestoneNotification(milestone: Milestone, context?: Record<string, unknown>): void {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  void appwrite.functions
    .createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "send-milestone-notification", milestone, context }),
    })
    .catch(() => {
      // Best-effort — see this file's own header.
    });
}
