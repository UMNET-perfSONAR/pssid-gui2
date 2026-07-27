import config from "../shared/config.ts"; // however you import your config
import { useUserStore } from "../stores/user.store.ts";

// returns true if form should be disabled
// see /shared/accessControl.ts and /server/routes/ on how access is blocked
export function isFormDisabled(): boolean {
    const userStore = useUserStore(); // call the function to get store instance

    // The server's own verdict settles it, in either posture. /api/userinfo
    // computes access_level from the same group mapping the API's authorize()
    // middleware enforces, so trusting it is the only way the interface and the
    // API cannot disagree -- and a form that is enabled for a write the server
    // will refuse (or greyed out for one it would accept) is the exact failure
    // this replaces.
    if (userStore.accessLevel !== null) {
      return userStore.accessLevel !== 'write';
    }

    // Fallbacks, for the window before that request lands and for an older
    // server that does not report a level. Prefer the posture the SERVER
    // reports, falling back to the values compiled into shared/config.ts: the
    // compiled values are build-time defaults an operator can override with
    // environment variables -- which is how a prebuilt image is configured -- so
    // trusting them alone would disable every form on a deployment whose server
    // is perfectly willing to accept the write.
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
