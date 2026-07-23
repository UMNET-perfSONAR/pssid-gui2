import config from "../shared/config.ts"; // however you import your config
import { useUserStore } from "../stores/user.store.ts";

// returns true if form should be disabled
// see /shared/accessControl.ts and /server/routes/ on how access is blocked
export function isFormDisabled(): boolean {
    const userStore = useUserStore(); // call the function to get store instance

    // Prefer the posture the SERVER reports (/api/userinfo), falling back to the
    // values compiled into shared/config.ts only until that request lands, or if
    // it failed. The compiled values are build-time defaults that an operator can
    // override with environment variables -- which is how a prebuilt image is
    // configured -- so trusting them alone would disable every form on a
    // deployment whose server is perfectly willing to accept the write.
    const ssoEnabled = userStore.ssoEnabled ?? config.ENABLE_SSO;
    const openWrite = userStore.openWrite ?? config.OPEN_WRITE;

    if (!ssoEnabled) {
      return openWrite === false;
    }

    if (userStore.isLoading || !userStore.user) {
      return true;
    }

    return !userStore.canWrite;
  }
