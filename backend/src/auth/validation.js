const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export function validateRegisterPayload(payload) {
  const errors = {};
  const data = {
    firstName: clean(payload.firstName),
    lastName: clean(payload.lastName),
    username: clean(payload.username),
    email: clean(payload.email).toLowerCase(),
    city: clean(payload.city),
    password: String(payload.password ?? ""),
    confirmPassword: String(payload.confirmPassword ?? ""),
    avatarUrl: clean(payload.avatarUrl)
  };

  if (data.firstName.length < 1 || data.firstName.length > 80) errors.firstName = "First name is required.";
  if (data.lastName.length < 1 || data.lastName.length > 80) errors.lastName = "Last name is required.";
  if (!USERNAME_RE.test(data.username)) {
    errors.username = "Username must be 3-24 characters and use letters, numbers, or underscores.";
  }
  if (!EMAIL_RE.test(data.email)) errors.email = "Enter a valid email address.";
  if (data.city.length > 120) errors.city = "City must be 120 characters or fewer.";
  if (data.password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (data.password !== data.confirmPassword) errors.confirmPassword = "Passwords do not match.";

  return { data, errors };
}

export function validateLoginPayload(payload) {
  const identifier = clean(payload.identifier);
  const password = String(payload.password ?? "");
  const errors = {};

  if (!identifier) errors.identifier = "Email or username is required.";
  if (!password) errors.password = "Password is required.";

  return { data: { identifier, password }, errors };
}

export function validateProfileUpdatePayload(payload) {
  const errors = {};
  const data = {
    firstName: clean(payload.firstName),
    lastName: clean(payload.lastName),
    city: clean(payload.city),
    avatarUrl: clean(payload.avatarUrl)
  };

  if (data.firstName.length < 1 || data.firstName.length > 80) errors.firstName = "First name is required.";
  if (data.lastName.length < 1 || data.lastName.length > 80) errors.lastName = "Last name is required.";
  if (data.city.length > 120) errors.city = "City must be 120 characters or fewer.";

  return { data, errors };
}

export function hasValidationErrors(errors) {
  return Object.keys(errors).length > 0;
}

function clean(value) {
  return String(value ?? "").trim();
}
