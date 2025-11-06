// Master file to enable or disable SSO (must edit both the frontend and backend config.ts file)
const config = {
  ENABLE_SSO: true,
  OPEN_WRITE: false, // if SSO is disabled, configure write options, true allows for write and read, false allows read only
  BASE_URL: "https://pssid-web-dev.miserver.it.umich.edu"
  // any other config values
};

export default config;