export const KAZAKHSTAN_REGIONS = [
  "Almaty",
  "Astana",
  "Shymkent",
  "Abai Region",
  "Akmola Region",
  "Aktobe Region",
  "Almaty Region",
  "Atyrau Region",
  "West Kazakhstan Region",
  "Zhambyl Region",
  "Zhetysu Region",
  "Karaganda Region",
  "Kostanay Region",
  "Kyzylorda Region",
  "Mangystau Region",
  "Pavlodar Region",
  "North Kazakhstan Region",
  "Turkistan Region",
  "Ulytau Region",
  "East Kazakhstan Region"
];

const REGION_SET = new Set(KAZAKHSTAN_REGIONS);

export function isValidKazakhstanRegion(value) {
  return REGION_SET.has(String(value ?? "").trim());
}
