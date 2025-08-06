// Master file to enable or disable SSO (must edit both the frontend and backend config.ts file)
const config = {
  ENABLE_SSO: false,
  OPEN_WRITE: false // if SSO is disabled, configure write options, true allows for write and read, false allows read only
  // any other config values
};

export default config;