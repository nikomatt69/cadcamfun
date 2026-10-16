import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { legacyIssuerHost } from "./constants.ts"

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}



const keyIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7.5a3.5 3.5 0 1 1-3.4 4.2H8.5L7 13.2 5.8 12l-2 2 1.3 1.3L6.3 14H11.6A3.5 3.5 0 0 1 15 7.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const mailIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const checkIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

type PageTone = "default" | "success" | "error"

function page(
  c: Context,
  title: string,
  content: string,
  status: ContentfulStatusCode = 200,
  tone: PageTone = "default",
  script = "",
): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "")
  // Build the script-src allowlist. We always permit inline scripts (so
  // extensions, userscripts, and TUI webviews can enhance the page) and the
  // issuer's own origin (so Cloudflare's "challenge-platform" managed
  // challenge / Turnstile can run AND post its solved token back to the same
  // origin via `fetch`). Everything else stays blocked by `default-src 'none'`.
  const issuerOrigin = new URL(c.env.ISSUER).origin
  // CSP policy:
  //   `default-src 'none'` blocks every implicit directive (img-src,
  //   font-src, media-src, frame-src, object-src, …). Injected scripts
  //   therefore cannot load images, fonts, or open frames.
  //   `script-src 'unsafe-inline' <ISSUER>` allows browser extensions,
  //   userscripts (Tampermonkey/Greasemonkey), and TUI webviews to run their
  //   own scripts on the page AND lets Cloudflare's challenge-platform script
  //   (served from `${ISSUER}/cdn-cgi/challenge-platform/…`) load when the
  //   zone is fronted by Bot Management / Managed Challenge. Login pages also
  //   ship a small inline WebAuthn helper; login_state is JSON-encoded and no
  //   other user input is interpolated, so `'unsafe-inline'` does not introduce
  //   an XSS vector here.
  //   `connect-src 'self'` permits scripts to call back to the issuer origin
  //   — which Cloudflare's challenge needs to round-trip its solved token.
  //   No third-party host is reachable from injected scripts.
  //   `style-src 'nonce-…'` keeps inline styles under control via a fresh
  //   per-response nonce.
  //   `form-action 'self'` ensures the email-code form posts only back to the
  //   issuer, even if an injected script rewrites the form's `action`.
  //   `base-uri 'none'` and `frame-ancestors 'none'` close the classic
  //   <base>-tag and clickjacking routes.
  c.header(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'unsafe-inline' ${issuerOrigin}; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  )
  c.header("Referrer-Policy", "no-referrer")
  c.header("X-Content-Type-Options", "nosniff")
  return c.html(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${escape(title)} - CADCAMFUN</title><style nonce="${nonce}">
:root{color-scheme:light;--bg:250 249 246;--panel:255 255 255;--border:220 214 200;--text:12 11 10;--muted:110 104 94;--accent:37 99 235;--success:22 163 74;--error:220 38 38;--code:244 242 238;--shadow:10 8 4;--grid-alpha:.35;--wash:0 0 0;--wash-alpha:.04;--radius-sm:6px;--radius-md:10px;--radius-card:16px;--shadow-soft:0 2px 16px -2px rgb(var(--shadow)/.08),0 1px 3px rgb(var(--shadow)/.04);--shadow-strong:0 12px 40px -6px rgb(var(--shadow)/.14),0 4px 12px -2px rgb(var(--shadow)/.06);--shadow-glow:0 4px 20px -3px rgb(var(--accent)/.42);--ease:cubic-bezier(.23,1,.32,1)}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:8 8 9;--panel:13 13 15;--border:32 30 27;--text:242 240 236;--muted:148 144 136;--accent:96 165 250;--success:74 222 128;--error:248 113 113;--code:18 17 16;--shadow:0 0 0;--grid-alpha:.62;--wash:255 255 255;--wash-alpha:.025;--shadow-soft:0 2px 16px -2px rgb(0 0 0/.4),0 1px 3px rgb(0 0 0/.2);--shadow-strong:0 12px 40px -6px rgb(0 0 0/.6),0 4px 12px -2px rgb(0 0 0/.3);--shadow-glow:0 4px 24px -5px rgb(var(--accent)/.32)}}
*{box-sizing:border-box}html{min-width:320px;min-height:100%;background:rgb(var(--bg))}body{margin:0;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:clamp(20px,5vw,48px) 20px;background-color:rgb(var(--bg));background-image:linear-gradient(rgb(var(--border)/var(--grid-alpha)) 1px,transparent 1px),linear-gradient(90deg,rgb(var(--border)/var(--grid-alpha)) 1px,transparent 1px),radial-gradient(ellipse 900px 600px at 92% 4%,rgb(var(--accent)/.07),transparent 58%),radial-gradient(ellipse 800px 540px at 5% 105%,rgb(var(--wash)/var(--wash-alpha)),transparent 64%);background-size:48px 48px,48px 48px,100%,100%;color:rgb(var(--text));font-family:"Figtree","Avenir Next",Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:16px;line-height:1.6;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}.page-shell{width:min(100%,440px);animation:enter .55s var(--ease) both}.brand{position:relative;z-index:0;display:inline-flex;align-items:center;margin:0 0 22px 5px;color:rgb(var(--text));text-decoration:none;transition:opacity .15s ease}.brand:hover{opacity:.82}.brand-word{position:relative;font-family:"Syne","Arial Black",system-ui,sans-serif;font-size:22px;font-weight:800;line-height:1;letter-spacing:-.055em}.brand-word:before,.brand-word:after{content:attr(data-word);position:absolute;inset:0;z-index:-1;color:transparent;-webkit-text-stroke:1px rgb(var(--muted)/.48)}.brand-word:before{transform:translate(2px,2px)}.brand-word:after{transform:translate(4px,4px);opacity:.55}.brand-domain{margin-left:10px;padding-left:10px;border-left:1px solid rgb(var(--border));color:rgb(var(--muted));font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.card{position:relative;overflow:hidden;padding:clamp(24px,6vw,32px);border:1px solid rgb(var(--border));border-radius:var(--radius-card);background:rgb(var(--panel)/.96);box-shadow:var(--shadow-strong)}.card:before{content:"";position:absolute;inset:0 24px auto;height:1px;background:rgb(255 255 255/.7)}.card:after{content:"";position:absolute;width:180px;height:180px;right:-90px;top:-110px;border-radius:999px;background:rgb(var(--accent)/.09);filter:blur(34px);pointer-events:none}.eyebrow{position:relative;display:flex;align-items:center;gap:8px;margin-bottom:13px;color:rgb(var(--accent));font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;line-height:1;letter-spacing:.18em;text-transform:uppercase}.eyebrow-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px rgb(var(--accent)/.12)}h1{position:relative;margin:0;color:rgb(var(--text));font-family:"Syne","Avenir Next",system-ui,sans-serif;font-size:clamp(26px,7vw,32px);font-weight:750;line-height:1.08;letter-spacing:-.035em}.body{position:relative;margin-top:14px}.body>p:first-child{margin-top:0}.body p{margin:0 0 22px;color:rgb(var(--muted));font-size:14px;line-height:1.7}.stack{display:grid;gap:14px}.or{display:flex;align-items:center;gap:12px;color:rgb(var(--muted));font-size:10px;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:.18em}.or:before,.or:after{content:"";height:1px;flex:1;background:rgb(var(--border))}form{margin:0}label{display:block;color:rgb(var(--text));font-size:12px;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:.13em}input{width:100%;height:46px;padding:0 14px;border:1px solid rgb(var(--border));border-radius:var(--radius-md);outline:0;background:rgb(var(--bg));color:rgb(var(--text));font:14px "Figtree","Avenir Next",Inter,system-ui,sans-serif;transition:border-color .15s ease,box-shadow .15s ease,background-color .15s ease}input:hover{border-color:rgb(var(--muted)/.55)}input:focus{border-color:rgb(var(--accent));box-shadow:0 0 0 3px rgb(var(--accent)/.18);background:rgb(var(--panel))}input::placeholder{color:rgb(var(--muted)/.58)}button,.button{display:inline-flex;width:100%;min-height:46px;align-items:center;justify-content:center;gap:9px;padding:11px 16px;border:1px solid rgb(var(--accent)/.25);border-radius:var(--radius-md);background:rgb(var(--accent));color:rgb(var(--bg));text-decoration:none;text-align:center;font:700 14px "Figtree","Avenir Next",Inter,system-ui,sans-serif;cursor:pointer;box-shadow:var(--shadow-glow);transition:transform .15s ease,opacity .15s ease,background-color .15s ease,border-color .15s ease,box-shadow .15s ease}button:hover,.button:hover{opacity:.9;transform:translateY(-1px)}button:active,.button:active{transform:scale(.97)}button:focus-visible,.button:focus-visible,input:focus-visible,.brand:focus-visible{outline:2px solid rgb(var(--accent));outline-offset:3px}.button svg,button svg{width:17px;height:17px;flex:none}.secondary{border-color:rgb(var(--border));background:rgb(var(--panel));color:rgb(var(--text));box-shadow:var(--shadow-soft)}.secondary:hover{border-color:rgb(var(--accent)/.48);background:rgb(var(--code));opacity:1}.danger{border-color:rgb(var(--error)/.3);background:rgb(var(--error)/.1);color:rgb(var(--error));box-shadow:none}.danger:hover{background:rgb(var(--error)/.16);opacity:1}.code{height:58px;text-align:center;font:700 clamp(21px,7vw,27px) "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.2em;font-variant-numeric:tabular-nums}.notice{margin:0 0 20px;padding:11px 13px;border:1px solid rgb(var(--error)/.28);border-radius:var(--radius-md);background:rgb(var(--error)/.09);color:rgb(var(--error));font-size:13px;line-height:1.55}.notice.hint{border-color:rgb(var(--border));background:rgb(var(--code));color:rgb(var(--muted))}.result{display:grid;place-items:center;width:46px;height:46px;margin:4px 0 18px;border:1px solid rgb(var(--accent)/.22);border-radius:var(--radius-md);background:rgb(var(--accent)/.1);color:rgb(var(--accent))}.result.success{border-color:rgb(var(--success)/.24);background:rgb(var(--success)/.1);color:rgb(var(--success))}.result.error{border-color:rgb(var(--error)/.24);background:rgb(var(--error)/.1);color:rgb(var(--error))}.result svg{width:23px;height:23px}.footer{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;color:rgb(var(--muted));font-size:11px;font-weight:600;letter-spacing:.02em}.secure-dot{width:6px;height:6px;border-radius:50%;background:rgb(var(--success))}@keyframes enter{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@media(max-width:480px){body{align-items:flex-start;padding:28px 14px}.page-shell{margin:auto 0}.card{padding:24px 20px}.brand{margin-left:3px}.brand-domain{font-size:10px}.code{letter-spacing:.14em}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style></head><body><div class="page-shell"><a class="brand" href="https://cadcam.fun" aria-label="cadcamfun home"><span class="brand-word" data-word="CADCAMFUN">CADCAMFUN</span><span class="brand-domain">identity</span></a><main class="card" data-tone="${tone}"><header><div class="eyebrow"><span class="eyebrow-dot"></span>secure account gateway</div><h1>${escape(title)}</h1></header><div class="body">${content}</div></main><footer class="footer"><span class="secure-dot"></span>Encrypted sign-in for CADCAMFUN</footer></div>${script}</body></html>`,
    status,
  )
}

/**
 * @param lead Replaces the default explanation above the buttons. The device
 *   flow uses it to say the approval is not finished yet: a user who has just
 *   clicked "Approve device" believes they are done, and this page — titled
 *   "Sign in or create an account", with no mention of the terminal — reads as
 *   an unrelated detour. Closing it here leaves the terminal polling a code
 *   nobody will ever approve, which is the single most common way a sign-in
 *   that the user thought succeeded quietly does not.
 */
export function loginPage(
  c: Context,
  loginState: string,
  message?: string,
  status: ContentfulStatusCode = 200,
  lead?: string,
): Response {
  // An error does not cancel the context. A device approval that mistyped its
  // email still has a terminal waiting, and dropping back to the generic
  // headline told them they were merely "signing in" — the one thing this page
  // exists to correct. The notice and the lead are shown together; without a
  // lead the behaviour is exactly what it was.
  const notice = message ? `<div class="notice" role="alert">${escape(message)}</div>` : ""
  const explanation =
    lead ??
    (message
      ? undefined
      : "Continue to CADCAMFUN desktop or mobile without sharing a password. If this is your first time, your account will be created automatically after verification.")
  const note = `${notice}${explanation ? `<p>${escape(explanation)}</p>` : ""}`
  // Shown by the script only after the first passkey prompt comes back empty:
  // a passkey saved before the issuer moved hosts is bound to the old one.
  const legacyHost = legacyIssuerHost(c.env.ISSUER)
  const legacyButton = legacyHost
    ? `<button type="button" class="secondary" id="passkey-legacy-btn" hidden>${keyIcon}Use a passkey saved on ${escape(legacyHost)}</button>`
    : ""
  return page(
    c,
    lead ? "One more step" : "Sign in or create an account",
    `${note}<div class="notice" id="passkey-error" hidden></div><div class="stack"><button type="button" id="passkey-btn">${keyIcon}Continue with passkey</button>${legacyButton}<div class="or">or use email</div><form class="stack" method="post" action="/login/email/request"><input type="hidden" name="login_state" value="${escape(loginState)}"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required><button type="submit">${mailIcon}Email me a code</button></form></div>`,
    status,
    "default",
    passkeyScript(loginState, "authenticate"),
  )
}

/** @param lead See {@link loginPage} — the device flow says what "Not now" finishes. */
export function passkeyOfferPage(
  c: Context,
  loginState: string,
  message?: string,
  status: ContentfulStatusCode = 200,
  lead?: string,
): Response {
  const note = message
    ? `<div class="notice" role="alert">${escape(message)}</div>`
    : `<p>${escape(lead ?? "Use Face ID, Touch ID, Windows Hello, or a password manager passkey next time so you can sign in without a code.")}</p>`
  return page(
    c,
    "Save a passkey",
    `${note}<div class="notice" id="passkey-error" hidden></div><div class="stack"><button type="button" id="passkey-register-btn">${keyIcon}Save a passkey</button><form method="post" action="/login/passkey/skip"><input type="hidden" name="login_state" value="${escape(loginState)}"><button class="secondary" type="submit" id="passkey-skip-btn">Not now</button></form></div>`,
    status,
    "default",
    passkeyScript(loginState, "register"),
  )
}

/**
 * Tiny WebAuthn client: convert base64url challenges, call credentials.get/create,
 * POST the JSON assertion, then follow the issuer's completion payload.
 * Kept inline so we do not add @simplewebauthn/browser to the hosted pages.
 */
function passkeyScript(loginState: string, mode: "authenticate" | "register"): string {
  return `<script>
(function () {
  var loginState = ${JSON.stringify(loginState)};
  var mode = ${JSON.stringify(mode)};
  var authBtn = document.getElementById("passkey-btn");
  var legacyBtn = document.getElementById("passkey-legacy-btn");
  var registerBtn = document.getElementById("passkey-register-btn");
  var skipBtn = document.getElementById("passkey-skip-btn");
  // No WebAuthn at all: an older browser, a webview, a hardened profile. The
  // offer page must not become a dead end for them — hiding the button that
  // cannot work leaves "Not now" as the only control, so it stops reading as a
  // refusal and becomes the way forward.
  if (!window.PublicKeyCredential) {
    if (authBtn) authBtn.hidden = true;
    if (registerBtn) registerBtn.hidden = true;
    if (skipBtn) {
      skipBtn.textContent = "Continue";
      skipBtn.className = "";
    }
    return;
  }
  function b64urlToBuf(value) {
    var padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - value.length % 4) % 4);
    var binary = atob(padded);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  function bufToB64url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
  }
  function showNote(message, hint) {
    var note = document.getElementById("passkey-error");
    if (!note) return;
    note.hidden = false;
    note.className = hint ? "notice hint" : "notice";
    note.textContent = message;
  }
  function showError(message) {
    showNote(message, false);
  }
  function credentialToJSON(credential) {
    var response = credential.response;
    var json = {
      id: credential.id,
      rawId: bufToB64url(credential.rawId),
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
      response: { clientDataJSON: bufToB64url(response.clientDataJSON) }
    };
    if (credential.authenticatorAttachment) json.authenticatorAttachment = credential.authenticatorAttachment;
    if (response.authenticatorData) {
      json.response.authenticatorData = bufToB64url(response.authenticatorData);
      json.response.signature = bufToB64url(response.signature);
      if (response.userHandle) json.response.userHandle = bufToB64url(response.userHandle);
    }
    if (response.attestationObject) {
      json.response.attestationObject = bufToB64url(response.attestationObject);
      if (response.getTransports) json.response.transports = response.getTransports();
    }
    return json;
  }
  function finish(result) {
    if (result && result.offer) {
      location.assign("/login/passkey/offer?login_state=" + encodeURIComponent(loginState));
      return;
    }
    if (result && result.redirect) {
      location.assign(result.redirect);
      return;
    }
    if (result && result.device) {
      // A stable confirmation URL, never a reload: reloading re-issues the
      // request that rendered this page with a consumed login intent.
      location.assign("/device/connected");
      return;
    }
    throw new Error("Passkey sign-in did not complete");
  }
  async function postJSON(path, body) {
    var response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(data.error_description || "Passkey request failed");
    }
    return data;
  }
  async function authenticate(legacy) {
    var options = await postJSON("/login/passkey/authentication/options", { login_state: loginState, legacy: legacy === true });
    var assertion = await navigator.credentials.get({
      publicKey: {
        challenge: b64urlToBuf(options.challenge),
        timeout: options.timeout,
        rpId: options.rpId,
        userVerification: options.userVerification,
        allowCredentials: (options.allowCredentials || []).map(function (cred) {
          return { type: cred.type, id: b64urlToBuf(cred.id), transports: cred.transports };
        })
      }
    });
    if (!assertion) throw new Error("Passkey sign-in was cancelled");
    finish(await postJSON("/login/passkey/authentication/verify", {
      login_state: loginState,
      credential: credentialToJSON(assertion)
    }));
  }
  async function register() {
    var options = await postJSON("/login/passkey/registration/options", { login_state: loginState });
    var attestation = await navigator.credentials.create({
      publicKey: {
        rp: options.rp,
        user: {
          id: b64urlToBuf(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName
        },
        challenge: b64urlToBuf(options.challenge),
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation,
        excludeCredentials: (options.excludeCredentials || []).map(function (cred) {
          return { type: cred.type, id: b64urlToBuf(cred.id), transports: cred.transports };
        })
      }
    });
    if (!attestation) throw new Error("Passkey was not created");
    finish(await postJSON("/login/passkey/registration/verify", {
      login_state: loginState,
      credential: credentialToJSON(attestation)
    }));
  }
  async function run(action, button, legacy) {
    if (button) button.disabled = true;
    try {
      await action(legacy);
    } catch (error) {
      if (button) button.disabled = false;
      var name = error && error.name;
      // The authenticator already holds a credential for this account — which
      // is exactly what excludeCredentials asks it to say. There is nothing to
      // save and nothing went wrong, so finish the sign-in rather than showing
      // the user a failure for being already set up.
      if (name === "InvalidStateError" && mode === "register" && skipBtn) {
        skipBtn.click();
        return;
      }
      // WebAuthn deliberately collapses "you dismissed the prompt" and "this
      // device has no passkey for us" into the same NotAllowedError, so that a
      // site cannot probe which credentials exist. Staying silent served the
      // first reading and stranded the second: a phone whose passkey lives in
      // another vendor's keychain — an iCloud passkey opened on Android — got a
      // button that did nothing at all. Say the one thing true of both, and
      // only while signing in: enrollment has a visible "Not now" beside it.
      if (name === "NotAllowedError") {
        if (mode === "authenticate") {
          // The first prompt only lists passkeys for the current host, so one
          // saved before the move looks exactly like "no passkey" here.
          if (legacyBtn && !legacy) legacyBtn.hidden = false;
          showNote(
            legacyBtn && !legacy
              ? "No passkey was used. If you saved yours before cadcamfun moved to cadcam.fun, use the button below; otherwise continue with an email code — you can save a passkey here afterwards."
              : "No passkey was used. If this device does not have one for cadcamfun, continue with an email code below — you can save a passkey here afterwards.",
            true
          );
        }
        return;
      }
      // Related Origin Requests are what let this origin use a passkey bound
      // to the old host; a browser without them refuses the RP ID outright.
      if (name === "SecurityError" && legacy) {
        showError(
          "This browser cannot use a passkey saved before cadcamfun moved to cadcam.fun. Continue with an email code below, then save a new passkey."
        );
        return;
      }
      if (name === "AbortError") return;
      showError(
        (error && error.message ? error.message : "Passkey sign-in failed") +
          (mode === "register" ? " You can continue without one." : "")
      );
    }
  }
  if (mode === "authenticate" && authBtn) {
    authBtn.addEventListener("click", function () { run(authenticate, authBtn, false); });
  }
  if (mode === "authenticate" && legacyBtn) {
    legacyBtn.addEventListener("click", function () { run(authenticate, legacyBtn, true); });
  }
  if (mode === "register" && registerBtn) {
    registerBtn.addEventListener("click", function () { run(register, registerBtn); });
  }
})();
</script>`
}

/**
 * Both code inputs accept whatever the user actually hands us — pasted with a
 * space in the middle, with the separating dash, or straight from an OTP
 * autofill that appends a trailing blank. A strict `pattern` used to reject
 * those client-side with the browser's own opaque "match the requested format"
 * bubble, so the code never even reached the server that would have been happy
 * to normalize it. The server strips non-digits; the pattern here only keeps
 * obvious garbage out.
 */
const CODE_INPUT_PATTERN = "[0-9][0-9\\s\\-]*"

export function emailCodePage(
  c: Context,
  loginState: string,
  email: string,
  message?: string,
  status: ContentfulStatusCode = 200,
): Response {
  const note = message
    ? `<div class="notice" role="alert">${escape(message)}</div>`
    : `<p>Enter the six-digit code sent to <strong>${escape(email)}</strong>. The code expires in 10 minutes.</p>`
  return page(
    c,
    "Check your email",
    `${note}<form class="stack" method="post" action="/login/email/verify"><input type="hidden" name="login_state" value="${escape(loginState)}"><label for="code">Verification code</label><input class="code" id="code" name="code" type="text" inputmode="numeric" pattern="${CODE_INPUT_PATTERN}" maxlength="12" autocomplete="one-time-code" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="000000" required autofocus><button type="submit">${checkIcon}Verify and continue</button></form><div class="or">no code?</div><form method="post" action="/login/email/request"><input type="hidden" name="login_state" value="${escape(loginState)}"><input type="hidden" name="email" value="${escape(email)}"><button class="secondary" type="submit">${mailIcon}Send a new code</button></form>`,
    status,
  )
}

export function devicePage(c: Context, userCode = "", message?: string, status: ContentfulStatusCode = 200): Response {
  const note = message
    ? `<div class="notice" role="alert">${escape(message)}</div>`
    : "<p>Enter the code shown in your CADCAMFUN app. Only approve a device you recognize.</p>"
  return page(
    c,
    "Connect a device",
    `${note}<form class="stack" method="post" action="/device"><label for="user_code">Device code</label><input class="code" id="user_code" name="user_code" type="text" value="${escape(userCode)}" inputmode="numeric" pattern="${CODE_INPUT_PATTERN}" maxlength="12" autocomplete="one-time-code" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="0000-0000" required autofocus><button name="decision" value="approve" type="submit">${checkIcon}Approve device</button><button class="danger" name="decision" value="deny" type="submit">Deny request</button></form>`,
    status,
  )
}

export function resultPage(c: Context, title: string, message: string, status: ContentfulStatusCode = 200): Response {
  const tone: PageTone = status >= 400 ? "error" : "success"
  const icon =
    tone === "success"
      ? checkIcon
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 3.5v.01M12 3l9 17H3L12 3Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return page(c, title, `<div class="result ${tone}">${icon}</div><p>${escape(message)}</p>`, status, tone)
}
