import https from "node:https";
import crypto from "node:crypto";

let googleAuthLibrary;

export function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

export function buildGoogleAuthorizationUrl() {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state
  });

  return {
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state
  };
}

export async function exchangeGoogleCodeForIdToken(code) {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured.");
  }
  if (!code) throw new Error("Google authorization code is required.");

  const response = await postForm("https://oauth2.googleapis.com/token", {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code"
  });

  if (!response.id_token) {
    throw new Error("Google did not return an ID token.");
  }

  return response.id_token;
}

export async function verifyGoogleIdToken(idToken) {
  if (!idToken) throw new Error("Google ID token is required.");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const ticket = (await verifyWithGoogleLibrary(idToken, clientId)) ?? (await fetchGoogleTokenInfo(idToken));

  if (clientId && ticket.aud !== clientId) {
    throw new Error("Google token audience mismatch.");
  }
  if (!ticket.email_verified && ticket.email_verified !== "true") {
    throw new Error("Google email is not verified.");
  }

  return {
    email: ticket.email,
    firstName: ticket.given_name ?? "",
    lastName: ticket.family_name ?? "",
    avatarUrl: ticket.picture ?? "",
    googleSubject: ticket.sub
  };
}

async function verifyWithGoogleLibrary(idToken, clientId) {
  if (!clientId) return null;

  if (googleAuthLibrary === undefined) {
    try {
      googleAuthLibrary = await import("google-auth-library");
    } catch {
      googleAuthLibrary = null;
    }
  }
  if (!googleAuthLibrary) return null;

  const client = new googleAuthLibrary.OAuth2Client(clientId);
  const loginTicket = await client.verifyIdToken({ idToken, audience: clientId });
  return loginTicket.getPayload();
}

function fetchGoogleTokenInfo(idToken) {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(body);
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(payload.error_description ?? "Google token verification failed."));
              return;
            }
            resolve(payload);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function postForm(url, form) {
  const body = new URLSearchParams(form).toString();
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: "POST",
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (response) => {
        let responseBody = "";
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(responseBody);
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(payload.error_description ?? payload.error ?? "Google token exchange failed."));
              return;
            }
            resolve(payload);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}
