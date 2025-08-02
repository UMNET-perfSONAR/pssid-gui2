import config from "../shared/config.ts"; // however you import your config
import { useUserStore } from "../stores/user.store.ts";

// returns true if form should be disabled
// see /shared/accessControl.ts and /server/routes/ on how access is blocked
export function isFormDisabled(): boolean {
    const userStore = useUserStore(); // call the function to get store instance
  
    if (!config.ENABLE_SSO) {
      return config.OPEN_WRITE === false;
    }
  
    if (userStore.isLoading || !userStore.user) {
      return true;
    }
  
    return !userStore.canWrite;
  }
