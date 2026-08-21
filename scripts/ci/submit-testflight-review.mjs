// Submits the most recently uploaded TestFlight build for Apple's Beta App
// Review, via the App Store Connect API. Meant to run only on a deliberate
// push to the `testflight` branch (see .github/workflows/ios-build.yml) —
// NOT on every push to `main`, which already uploads a build to TestFlight
// on its own but should never trigger a review by itself (every push would
// burn a review cycle on Apple's side, often with nothing meaningful in
// "What to Test", which is itself a common rejection reason).
//
// Auth: an App Store Connect API key (ES256-signed JWT), the same
// KEY_ID/ISSUER_ID/KEY_PATH already used elsewhere in this repo's CI to
// upload builds via `altool`. Docs: https://developer.apple.com/documentation/appstoreconnectapi

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const KEY_ID = process.env.KEY_ID;
const ISSUER_ID = process.env.ISSUER_ID;
const KEY_PATH = process.env.KEY_PATH;
const BUNDLE_ID = "com.xanthus.app";
const BETA_GROUP_NAME = "Beta";
const API_BASE = "https://api.appstoreconnect.apple.com/v1";

// A build just uploaded by the `testflight` job (main) takes Apple a few
// minutes to finish processing before it's submittable — poll instead of
// failing outright. This job only runs on a deliberate push to
// `testflight`, not on every commit, so a few minutes of patience here is
// cheap next to doing this by hand in the App Store Connect UI.
const PROCESSING_POLL_MS = 30_000;
const PROCESSING_TIMEOUT_MS = 20 * 60 * 1000;

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A fresh JWT per call (each is cheap to mint) rather than one reused for
// the whole script — sidesteps having to reason about the 20-minute expiry
// against however long the processing-wait loop below ends up taking.
function makeJwt() {
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 60 * 15, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const privateKey = readFileSync(KEY_PATH, "utf8");
  // `dsaEncoding: "ieee-p1363"` is the part that's easy to miss: Node's
  // default ECDSA signature encoding is DER, but JWS/JWT ES256 requires the
  // raw (r || s) fixed-width concatenation instead — signing without this
  // option produces a syntactically valid JWT that Apple's API silently
  // rejects as an invalid signature.
  const signature = createSign("SHA256").update(signingInput).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${makeJwt()}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function findAppId() {
  const res = await api(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`);
  const appId = res.data?.[0]?.id;
  if (!appId) throw new Error(`No app found in App Store Connect for bundle id "${BUNDLE_ID}".`);
  return appId;
}

async function waitForLatestProcessedBuild(appId) {
  const deadline = Date.now() + PROCESSING_TIMEOUT_MS;
  for (;;) {
    const res = await api(
      `/builds?filter[app]=${appId}&sort=-uploadedDate&limit=1&fields[builds]=version,processingState,uploadedDate`,
    );
    const build = res.data?.[0];
    if (!build) throw new Error("No builds found for this app in App Store Connect yet.");

    const state = build.attributes.processingState;
    if (state === "VALID") return build;
    if (state === "FAILED" || state === "INVALID") {
      throw new Error(`Latest build ${build.id} (version ${build.attributes.version}) finished processing as ${state} — nothing to submit.`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${PROCESSING_TIMEOUT_MS / 60_000} minutes waiting for build ${build.id} to finish processing (still ${state}).`);
    }
    console.log(`Build ${build.id} (version ${build.attributes.version}) still processing (${state}) — checking again in ${PROCESSING_POLL_MS / 1000}s.`);
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
  }
}

async function findBetaGroupId(appId) {
  const res = await api(`/betaGroups?filter[app]=${appId}&filter[name]=${encodeURIComponent(BETA_GROUP_NAME)}`);
  const groupId = res.data?.[0]?.id;
  if (!groupId) throw new Error(`No beta group named "${BETA_GROUP_NAME}" found for this app.`);
  return groupId;
}

async function main() {
  if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
    console.log("APP_STORE_CONNECT_KEY_ID/ISSUER_ID/API_KEY_P8 not configured — nothing to submit.");
    return;
  }

  const appId = await findAppId();
  const build = await waitForLatestProcessedBuild(appId);
  console.log(`Latest processed build: ${build.id} (version ${build.attributes.version}).`);

  const groupId = await findBetaGroupId(appId);
  try {
    await api(`/betaGroups/${groupId}/relationships/builds`, {
      method: "POST",
      body: JSON.stringify({ data: [{ type: "builds", id: build.id }] }),
    });
    console.log(`Added build ${build.id} to beta group "${BETA_GROUP_NAME}".`);
  } catch (err) {
    // Adding a build already in the group is expected the second time this
    // runs against the same build (e.g. a retry after the review-submission
    // call below failed) — not fatal, the submission call is what matters.
    console.log(`Could not add build ${build.id} to "${BETA_GROUP_NAME}" (likely already a member): ${err.message}`);
  }

  await api(`/betaAppReviewSubmissions`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaAppReviewSubmissions",
        relationships: { build: { data: { type: "builds", id: build.id } } },
      },
    }),
  });
  console.log(`Build ${build.id} submitted for Beta App Review.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
