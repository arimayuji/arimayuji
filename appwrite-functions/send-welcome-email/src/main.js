import { Client, Users } from "node-appwrite";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "Xanthus <noreply@xanthus.app.br>";
// The horse-bust mark (src/app/horse-mark.tsx) — already proven at this
// exact "small badge" size for the PWA/favicon, so it holds up in an email
// header too. PNG, not the SVG this is exported from (assets/logo.svg):
// Outlook/Hotmail's rendering engine has notoriously poor inline-SVG
// support in email, unlike a browser.
const LOGO_URL = "https://xanthus.app.br/pwa-icon-192.png";

function welcomeEmailHtml(name) {
  const greeting = name ? `Oi, ${name}!` : "Oi!";
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14181c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #dde1e6;">
            <tr>
              <td style="padding:32px 28px;">
                <img src="${LOGO_URL}" width="40" height="40" alt="Xanthus" style="display:block;margin:0 0 12px;border-radius:10px;" />
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#2f6fed;font-weight:600;">Xanthus</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${greeting} Bem-vindo(a).</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#5c6570;">
                  Sua conta t&#225; pronta. Pre&#231;o travado, GPS que n&#227;o inventa e os dados s&#227;o
                  seus &#8212; cada corrida fica salva primeiro no seu aparelho, com ou sem conta.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5c6570;">
                  Quando quiser, &#233; s&#243; abrir o app e apertar &#8220;Come&#231;ar a correr&#8221;.
                </p>
                <a href="https://xanthus.app.br" style="display:inline-block;background:#2f6fed;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;">
                  Abrir o Xanthus
                </a>
                <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#93a0ab;">
                  D&#250;vida ou problema? Escreve pra
                  <a href="mailto:contato@xanthus.app.br" style="color:#2f6fed;">contato@xanthus.app.br</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Appwrite Function, invoked directly from the client right after
 * `createProfile()` succeeds (see src/lib/auth.ts's `sendWelcomeEmail` and
 * handle-picker.tsx) — NOT wired to the `users.create` event. Appwrite's own
 * event system is documented as unreliable for OAuth-created accounts
 * (Google/Apple, the only login this app offers: the create-user and
 * create-session steps happen together on their end, and only one event
 * fires), so "right after handle-picker creates the profile" is the one
 * client-observable moment that's reliably "this account is brand new."
 *
 * Same auth shape as appwrite-functions/delete-account: called with the
 * signed-in user's own session, so Appwrite auto-injects that caller's ID
 * into `x-appwrite-user-id` and a scoped, short-lived API key into
 * `x-appwrite-key` — no static admin secret stored here. The privileged
 * Users API is only needed to look up the athlete's email (the client-side
 * `Account` type deliberately doesn't carry it, see auth.ts).
 *
 * Deploy (via Appwrite CLI — see README "E-mail transacional (Resend)"):
 *
 *   cd appwrite-functions/send-welcome-email
 *   appwrite functions create \
 *     --function-id send-welcome-email --name "Enviar e-mail de boas-vindas" \
 *     --runtime node-22 --entrypoint src/main.js \
 *     --execute users
 *   appwrite push functions
 *
 * Then, in the Appwrite Console:
 *   - Functions -> send-welcome-email -> Settings -> API key scopes: mark
 *     `users.read` (this function never writes anything).
 *   - Functions -> send-welcome-email -> Settings -> Variables:
 *     `RESEND_API_KEY` (see README for how to get one).
 */
async function sendWelcomeEmail({ req, res, log, error }) {
  const userId = req.headers["x-appwrite-user-id"];
  if (!userId) {
    return res.json({ error: "not-authenticated" }, 401);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    error("RESEND_API_KEY não configurada nas Variables da function.");
    return res.json({ error: "missing-api-key" }, 500);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const users = new Users(client);

  let user;
  try {
    user = await users.get({ userId });
  } catch (err) {
    error(`Falha buscando usuário ${userId}: ${err.message}`);
    return res.json({ error: "user-lookup-failed" }, 500);
  }

  if (!user.email) {
    log(`Usuário ${userId} sem e-mail (provedor não devolveu um) — nada pra enviar.`);
    return res.json({ skipped: true });
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: user.email,
      subject: "Bem-vindo(a) ao Xanthus",
      html: welcomeEmailHtml(user.name),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    error(`Resend recusou o envio (${response.status}): ${body}`);
    return res.json({ error: "resend-failed" }, 502);
  }

  log(`Welcome email enviado pra ${user.email}.`);
  return res.json({ ok: true });
}

export default sendWelcomeEmail;
