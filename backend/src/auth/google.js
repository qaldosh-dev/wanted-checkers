let googleAuthLibrary;

export function isGoogleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID ?? "";
}

export async function verifyGoogleIdToken(credential) {
  if (!credential) throw new Error("Google ID token is required.");
  if (!isGoogleOAuthConfigured()) throw new Error("Google login is not configured.");

  const clientId = getGoogleClientId();
  const library = await loadGoogleAuthLibrary();
  const client = new library.OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId
  });
  const payload = ticket.getPayload();

  if (!payload?.email) throw new Error("Google account email is required.");
  if (payload.email_verified !== true) throw new Error("Google email is not verified.");

  return {
    email: payload.email.toLowerCase(),
    firstName: payload.given_name ?? "",
    lastName: payload.family_name ?? "",
    avatarUrl: payload.picture ?? "",
    googleSubject: payload.sub
  };
}

async function loadGoogleAuthLibrary() {
  if (googleAuthLibrary === undefined) {
    try {
      googleAuthLibrary = await import("google-auth-library");
    } catch {
      googleAuthLibrary = null;
    }
  }

  if (!googleAuthLibrary) {
    throw new Error("google-auth-library is required for Google login.");
  }

  return googleAuthLibrary;
}
