/**
 * Centralised app naming/config so a rename is one edit (master-plan §11, Q8).
 * Working/codename: PHC-Track. Final product name TBD.
 */
export const APP_CONFIG = {
  /** Short human label used in the title bar / install prompt. */
  shortName: "PHC-Track",
  /** Full working name from the plan. */
  name: "Nnewi North PHC Digital Health Platform",
  codename: "PHC-Track",
  lga: "Nnewi North",
  state: "Anambra",
  country: "Nigeria",
  locale: "en-NG",
  /** Compliance baseline carried through the UI footer. */
  complianceBaseline: "NDPA 2023",
  /**
   * Default sync-hub URL. This package is consumed by both the browser app and
   * the Node API, so it stays free of `import.meta`; the web app overrides this
   * from `VITE_API_BASE_URL` at its own call site (see apps/web/src/lib/api.ts).
   */
  apiBaseUrl: "http://localhost:3000/api/v1",
} as const;
