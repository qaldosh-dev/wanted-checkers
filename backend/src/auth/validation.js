import { isValidKazakhstanRegion } from "../regions/kazakhstanRegions.js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export function validateOnboardingPayload(payload) {
  const errors = {};
  const data = {
    onboardingToken: clean(payload.onboardingToken),
    username: clean(payload.username).toLowerCase(),
    city: clean(payload.city),
    avatarUrl: clean(payload.avatarUrl)
  };

  if (!data.onboardingToken) errors.onboardingToken = "Google onboarding session is required.";
  if (!isValidUsername(data.username)) {
    errors.username = usernameValidationMessage();
  }
  if (!isValidKazakhstanRegion(data.city)) errors.city = "Select a valid Kazakhstan region.";
  if (data.avatarUrl.length > 500) errors.avatarUrl = "Avatar URL must be 500 characters or fewer.";

  return { data, errors };
}

export function validateUsernameParam(username) {
  const value = clean(username).toLowerCase();
  return {
    username: value,
    error: isValidUsername(value) ? "" : usernameValidationMessage()
  };
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
  if (!isValidKazakhstanRegion(data.city)) errors.city = "Select a valid Kazakhstan region.";
  if (data.avatarUrl.length > 500) errors.avatarUrl = "Avatar URL must be 500 characters or fewer.";

  return { data, errors };
}

export function hasValidationErrors(errors) {
  return Object.keys(errors).length > 0;
}

function isValidUsername(username) {
  return USERNAME_RE.test(username);
}

function usernameValidationMessage() {
  return "Username must be 3-24 characters and use letters, numbers, or underscores.";
}

function clean(value) {
  return String(value ?? "").trim();
}
