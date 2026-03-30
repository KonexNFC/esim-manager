// ─── Country metadata lookup ──────────────────────────────────────────────────
// Maps ISO-3166-1 alpha-2 codes → { name, region }.
// Flag emojis are derived algorithmically from the country code.
// Region taxonomy matches the frontend filter labels.

export type GeoRegion =
  | "Africa"
  | "Asia"
  | "Caribbean"
  | "Central America"
  | "Europe"
  | "Middle East"
  | "North America"
  | "Oceania"
  | "South America"
  | "South Asia"
  | "Southeast Asia"
  | "Global";

export interface CountryMeta {
  name: string;
  region: GeoRegion;
}

/** Derive a flag emoji from a 2-letter ISO code. */
export function iso2ToFlag(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return "🌍";
  return String.fromCodePoint(
    0x1f1e6 + (upper.charCodeAt(0) - 65),
    0x1f1e6 + (upper.charCodeAt(1) - 65),
  );
}

const COUNTRY_DATA: Record<string, CountryMeta> = {
  // ── Africa ──────────────────────────────────────────
  AO: { name: "Angola",                        region: "Africa" },
  BF: { name: "Burkina Faso",                  region: "Africa" },
  BI: { name: "Burundi",                       region: "Africa" },
  BJ: { name: "Benin",                         region: "Africa" },
  BW: { name: "Botswana",                      region: "Africa" },
  CD: { name: "DR Congo",                      region: "Africa" },
  CF: { name: "Central African Republic",      region: "Africa" },
  CG: { name: "Republic of Congo",             region: "Africa" },
  CI: { name: "Côte d'Ivoire",                 region: "Africa" },
  CM: { name: "Cameroon",                      region: "Africa" },
  CV: { name: "Cape Verde",                    region: "Africa" },
  DJ: { name: "Djibouti",                      region: "Africa" },
  DZ: { name: "Algeria",                       region: "Africa" },
  EG: { name: "Egypt",                         region: "Africa" },
  ER: { name: "Eritrea",                       region: "Africa" },
  ET: { name: "Ethiopia",                      region: "Africa" },
  GA: { name: "Gabon",                         region: "Africa" },
  GH: { name: "Ghana",                         region: "Africa" },
  GM: { name: "Gambia",                        region: "Africa" },
  GN: { name: "Guinea",                        region: "Africa" },
  GQ: { name: "Equatorial Guinea",             region: "Africa" },
  GW: { name: "Guinea-Bissau",                 region: "Africa" },
  KE: { name: "Kenya",                         region: "Africa" },
  LR: { name: "Liberia",                       region: "Africa" },
  LS: { name: "Lesotho",                       region: "Africa" },
  LY: { name: "Libya",                         region: "Africa" },
  MA: { name: "Morocco",                       region: "Africa" },
  MG: { name: "Madagascar",                    region: "Africa" },
  ML: { name: "Mali",                          region: "Africa" },
  MR: { name: "Mauritania",                    region: "Africa" },
  MU: { name: "Mauritius",                     region: "Africa" },
  MW: { name: "Malawi",                        region: "Africa" },
  MZ: { name: "Mozambique",                    region: "Africa" },
  NA: { name: "Namibia",                       region: "Africa" },
  NE: { name: "Niger",                         region: "Africa" },
  NG: { name: "Nigeria",                       region: "Africa" },
  RE: { name: "Réunion",                       region: "Africa" },
  RW: { name: "Rwanda",                        region: "Africa" },
  SC: { name: "Seychelles",                    region: "Africa" },
  SD: { name: "Sudan",                         region: "Africa" },
  SL: { name: "Sierra Leone",                  region: "Africa" },
  SN: { name: "Senegal",                       region: "Africa" },
  SO: { name: "Somalia",                       region: "Africa" },
  SS: { name: "South Sudan",                   region: "Africa" },
  ST: { name: "São Tomé and Príncipe",         region: "Africa" },
  SZ: { name: "Eswatini",                      region: "Africa" },
  TD: { name: "Chad",                          region: "Africa" },
  TG: { name: "Togo",                          region: "Africa" },
  TN: { name: "Tunisia",                       region: "Africa" },
  TZ: { name: "Tanzania",                      region: "Africa" },
  UG: { name: "Uganda",                        region: "Africa" },
  YT: { name: "Mayotte",                       region: "Africa" },
  ZA: { name: "South Africa",                  region: "Africa" },
  ZM: { name: "Zambia",                        region: "Africa" },
  ZW: { name: "Zimbabwe",                      region: "Africa" },

  // ── Asia ────────────────────────────────────────────
  AM: { name: "Armenia",                       region: "Asia" },
  AZ: { name: "Azerbaijan",                    region: "Asia" },
  CN: { name: "China",                         region: "Asia" },
  GE: { name: "Georgia",                       region: "Asia" },
  HK: { name: "Hong Kong",                     region: "Asia" },
  JP: { name: "Japan",                         region: "Asia" },
  KG: { name: "Kyrgyzstan",                    region: "Asia" },
  KR: { name: "South Korea",                   region: "Asia" },
  KZ: { name: "Kazakhstan",                    region: "Asia" },
  MN: { name: "Mongolia",                      region: "Asia" },
  MO: { name: "Macau",                         region: "Asia" },
  TJ: { name: "Tajikistan",                    region: "Asia" },
  TW: { name: "Taiwan",                        region: "Asia" },
  UZ: { name: "Uzbekistan",                    region: "Asia" },

  // ── Caribbean ───────────────────────────────────────
  AG: { name: "Antigua and Barbuda",           region: "Caribbean" },
  AI: { name: "Anguilla",                      region: "Caribbean" },
  AN: { name: "Netherlands Antilles",          region: "Caribbean" },
  AW: { name: "Aruba",                         region: "Caribbean" },
  BB: { name: "Barbados",                      region: "Caribbean" },
  BL: { name: "Saint Barthélemy",              region: "Caribbean" },
  BM: { name: "Bermuda",                       region: "Caribbean" },
  BQ: { name: "Caribbean Netherlands",         region: "Caribbean" },
  BS: { name: "Bahamas",                       region: "Caribbean" },
  CU: { name: "Cuba",                          region: "Caribbean" },
  CW: { name: "Curaçao",                       region: "Caribbean" },
  DM: { name: "Dominica",                      region: "Caribbean" },
  DO: { name: "Dominican Republic",            region: "Caribbean" },
  GD: { name: "Grenada",                       region: "Caribbean" },
  GP: { name: "Guadeloupe",                    region: "Caribbean" },
  HT: { name: "Haiti",                         region: "Caribbean" },
  JM: { name: "Jamaica",                       region: "Caribbean" },
  KN: { name: "Saint Kitts and Nevis",         region: "Caribbean" },
  KY: { name: "Cayman Islands",                region: "Caribbean" },
  LC: { name: "Saint Lucia",                   region: "Caribbean" },
  MF: { name: "Saint Martin",                  region: "Caribbean" },
  MQ: { name: "Martinique",                    region: "Caribbean" },
  MS: { name: "Montserrat",                    region: "Caribbean" },
  PR: { name: "Puerto Rico",                   region: "Caribbean" },
  TC: { name: "Turks and Caicos",              region: "Caribbean" },
  TT: { name: "Trinidad and Tobago",           region: "Caribbean" },
  VC: { name: "Saint Vincent and the Grenadines", region: "Caribbean" },
  VG: { name: "British Virgin Islands",        region: "Caribbean" },
  VI: { name: "US Virgin Islands",             region: "Caribbean" },

  // ── Central America ─────────────────────────────────
  BZ: { name: "Belize",                        region: "Central America" },
  CR: { name: "Costa Rica",                    region: "Central America" },
  GT: { name: "Guatemala",                     region: "Central America" },
  HN: { name: "Honduras",                      region: "Central America" },
  MX: { name: "Mexico",                        region: "Central America" },
  NI: { name: "Nicaragua",                     region: "Central America" },
  PA: { name: "Panama",                        region: "Central America" },
  SV: { name: "El Salvador",                   region: "Central America" },

  // ── Europe ──────────────────────────────────────────
  AD: { name: "Andorra",                       region: "Europe" },
  AL: { name: "Albania",                       region: "Europe" },
  AT: { name: "Austria",                       region: "Europe" },
  AX: { name: "Åland Islands",                 region: "Europe" },
  BA: { name: "Bosnia and Herzegovina",        region: "Europe" },
  BE: { name: "Belgium",                       region: "Europe" },
  BG: { name: "Bulgaria",                      region: "Europe" },
  BY: { name: "Belarus",                       region: "Europe" },
  CH: { name: "Switzerland",                   region: "Europe" },
  CY: { name: "Cyprus",                        region: "Europe" },
  CZ: { name: "Czech Republic",               region: "Europe" },
  DE: { name: "Germany",                       region: "Europe" },
  DK: { name: "Denmark",                       region: "Europe" },
  EE: { name: "Estonia",                       region: "Europe" },
  ES: { name: "Spain",                         region: "Europe" },
  FI: { name: "Finland",                       region: "Europe" },
  FO: { name: "Faroe Islands",                 region: "Europe" },
  FR: { name: "France",                        region: "Europe" },
  GB: { name: "United Kingdom",                region: "Europe" },
  GG: { name: "Guernsey",                      region: "Europe" },
  GI: { name: "Gibraltar",                     region: "Europe" },
  GL: { name: "Greenland",                     region: "Europe" },
  GR: { name: "Greece",                        region: "Europe" },
  HR: { name: "Croatia",                       region: "Europe" },
  HU: { name: "Hungary",                       region: "Europe" },
  IC: { name: "Canary Islands",                region: "Europe" },
  IE: { name: "Ireland",                       region: "Europe" },
  IM: { name: "Isle of Man",                   region: "Europe" },
  IS: { name: "Iceland",                       region: "Europe" },
  IT: { name: "Italy",                         region: "Europe" },
  JE: { name: "Jersey",                        region: "Europe" },
  LI: { name: "Liechtenstein",                 region: "Europe" },
  LT: { name: "Lithuania",                     region: "Europe" },
  LU: { name: "Luxembourg",                    region: "Europe" },
  LV: { name: "Latvia",                        region: "Europe" },
  MC: { name: "Monaco",                        region: "Europe" },
  MD: { name: "Moldova",                       region: "Europe" },
  ME: { name: "Montenegro",                    region: "Europe" },
  MK: { name: "North Macedonia",               region: "Europe" },
  MT: { name: "Malta",                         region: "Europe" },
  NL: { name: "Netherlands",                   region: "Europe" },
  NO: { name: "Norway",                        region: "Europe" },
  PL: { name: "Poland",                        region: "Europe" },
  PT: { name: "Portugal",                      region: "Europe" },
  RO: { name: "Romania",                       region: "Europe" },
  RS: { name: "Serbia",                        region: "Europe" },
  RU: { name: "Russia",                        region: "Europe" },
  SE: { name: "Sweden",                        region: "Europe" },
  SI: { name: "Slovenia",                      region: "Europe" },
  SK: { name: "Slovakia",                      region: "Europe" },
  SM: { name: "San Marino",                    region: "Europe" },
  TR: { name: "Turkey",                        region: "Europe" },
  UA: { name: "Ukraine",                       region: "Europe" },
  VA: { name: "Vatican City",                  region: "Europe" },
  XK: { name: "Kosovo",                        region: "Europe" },

  // ── Middle East ─────────────────────────────────────
  AE: { name: "United Arab Emirates",          region: "Middle East" },
  BH: { name: "Bahrain",                       region: "Middle East" },
  IL: { name: "Israel",                        region: "Middle East" },
  IQ: { name: "Iraq",                          region: "Middle East" },
  IR: { name: "Iran",                          region: "Middle East" },
  JO: { name: "Jordan",                        region: "Middle East" },
  KW: { name: "Kuwait",                        region: "Middle East" },
  LB: { name: "Lebanon",                       region: "Middle East" },
  OM: { name: "Oman",                          region: "Middle East" },
  PS: { name: "Palestine",                     region: "Middle East" },
  QA: { name: "Qatar",                         region: "Middle East" },
  SA: { name: "Saudi Arabia",                  region: "Middle East" },
  SY: { name: "Syria",                         region: "Middle East" },
  YE: { name: "Yemen",                         region: "Middle East" },

  // ── North America ───────────────────────────────────
  CA: { name: "Canada",                        region: "North America" },
  GU: { name: "Guam",                          region: "North America" },
  US: { name: "United States",                 region: "North America" },

  // ── Oceania ─────────────────────────────────────────
  AU: { name: "Australia",                     region: "Oceania" },
  FJ: { name: "Fiji",                          region: "Oceania" },
  NR: { name: "Nauru",                         region: "Oceania" },
  NZ: { name: "New Zealand",                   region: "Oceania" },
  PG: { name: "Papua New Guinea",              region: "Oceania" },
  TO: { name: "Tonga",                         region: "Oceania" },
  VU: { name: "Vanuatu",                       region: "Oceania" },
  WS: { name: "Samoa",                         region: "Oceania" },

  // ── South America ───────────────────────────────────
  AR: { name: "Argentina",                     region: "South America" },
  BO: { name: "Bolivia",                       region: "South America" },
  BR: { name: "Brazil",                        region: "South America" },
  CL: { name: "Chile",                         region: "South America" },
  CO: { name: "Colombia",                      region: "South America" },
  EC: { name: "Ecuador",                       region: "South America" },
  GF: { name: "French Guiana",                 region: "South America" },
  GY: { name: "Guyana",                        region: "South America" },
  PE: { name: "Peru",                          region: "South America" },
  PY: { name: "Paraguay",                      region: "South America" },
  SR: { name: "Suriname",                      region: "South America" },
  UY: { name: "Uruguay",                       region: "South America" },
  VE: { name: "Venezuela",                     region: "South America" },

  // ── South Asia ──────────────────────────────────────
  BD: { name: "Bangladesh",                    region: "South Asia" },
  BT: { name: "Bhutan",                        region: "South Asia" },
  IN: { name: "India",                         region: "South Asia" },
  LK: { name: "Sri Lanka",                     region: "South Asia" },
  MV: { name: "Maldives",                      region: "South Asia" },
  NP: { name: "Nepal",                         region: "South Asia" },
  PK: { name: "Pakistan",                      region: "South Asia" },

  // ── Southeast Asia ──────────────────────────────────
  BN: { name: "Brunei",                        region: "Southeast Asia" },
  ID: { name: "Indonesia",                     region: "Southeast Asia" },
  KH: { name: "Cambodia",                      region: "Southeast Asia" },
  LA: { name: "Laos",                          region: "Southeast Asia" },
  MM: { name: "Myanmar",                       region: "Southeast Asia" },
  MY: { name: "Malaysia",                      region: "Southeast Asia" },
  PH: { name: "Philippines",                   region: "Southeast Asia" },
  SG: { name: "Singapore",                     region: "Southeast Asia" },
  TH: { name: "Thailand",                      region: "Southeast Asia" },
  TL: { name: "Timor-Leste",                   region: "Southeast Asia" },
  VN: { name: "Vietnam",                       region: "Southeast Asia" },
};

// Aliases for non-standard codes that appear in provider data
const CODE_ALIASES: Record<string, string> = {
  CYP: "CY",  // Cyprus (3-letter code used by some providers)
  AN:  "CW",  // Netherlands Antilles → Curaçao (closest modern code)
  IC:  "ES",  // Canary Islands → Spain (fallback for flag)
};

/** Look up metadata for an ISO-2 (or aliased) country code. */
export function getCountryInfo(rawCode: string): CountryMeta | null {
  const code = (CODE_ALIASES[rawCode.toUpperCase()] ?? rawCode).toUpperCase();
  return COUNTRY_DATA[code] ?? null;
}

/** Normalise a raw region_code from the DB to a canonical ISO-2 code. */
export function normaliseCode(rawCode: string): string {
  return (CODE_ALIASES[rawCode.toUpperCase()] ?? rawCode).toUpperCase();
}

/** All region labels, sorted for display. */
export const ALL_REGIONS: GeoRegion[] = [
  "Africa",
  "Asia",
  "Caribbean",
  "Central America",
  "Europe",
  "Middle East",
  "North America",
  "Oceania",
  "South America",
  "South Asia",
  "Southeast Asia",
];
