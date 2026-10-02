// Master file to enable or disable SSO (must edit both the frontend and backend config.ts file)
const config = {
  ENABLE_SSO: false,
  // With SSO disabled, this governs write access. It ships FALSE (read-only) so
  // that a deployment is never unauthenticated-writable by accident: an open
  // instance has to be an explicit choice. Set it to true (or pass OPEN_WRITE=true
  // to the server) only when the site is otherwise access-controlled.
  OPEN_WRITE: false,
  // Placeholder; the installer rewrites this with the deployment's hostname.
  BASE_URL: "https://pssid.example.edu"
  // any other config values
};

export default config;