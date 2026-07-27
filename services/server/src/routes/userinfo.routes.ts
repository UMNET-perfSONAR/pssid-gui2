import express, { Request, Response } from 'express';
import {
  isSsoEnabled,
  isOpenWrite,
  resolveRequestGroups,
  effectiveAccessLevel,
} from '../shared/accessControl';

const router = express.Router();

// No requiresAuth() guard here, and no OIDC-dependent branch at module load.
//
// This endpoint is how the browser discovers whether anyone is signed in, which
// makes it the one place that must answer usefully when nobody is. index.ts
// already gates /api/* with requireApiAuthentication when SSO is on, so an
// anonymous caller never reaches this handler in that posture; with SSO off there
// is no identity to report and the posture below is the whole answer.
//
// It is also resolved through isSsoEnabled() rather than the compiled
// config.ENABLE_SSO, because the posture can be switched by environment variable
// without a rebuild -- the point of shipping prebuilt images (install.sh --pull).
// Reading the compiled default would desynchronise this route from the rest of
// the app on a pulled image: the OIDC middleware would authenticate the user
// while this endpoint still reported "nobody is signed in", and the client would
// fall back to the OPEN_WRITE policy for a user who actually has a session.
router.get('/', async (req: Request, res: Response) => {
  try {
    // The EFFECTIVE auth posture, resolved from the environment, travels with
    // every identity response. The client compiles shared/config.ts into its
    // bundle, so on its own it can only see the values that were baked in at
    // build time -- and an operator who sets ENABLE_SSO/OPEN_WRITE in the
    // environment (the documented way to configure a prebuilt image) would move
    // the server without moving the browser. That desync is not cosmetic: with
    // OPEN_WRITE=true on the server but false in the bundle, every write is
    // permitted yet the interface grays out all of its own forms.
    const posture = { sso_enabled: isSsoEnabled(), open_write: isOpenWrite() };

    // No SSO: return an empty identity rather than erroring; the client treats
    // this as "no signed-in user" and falls back to the OPEN_WRITE policy.
    // Same env-aware resolution as above, for the same reason.
    if (!isSsoEnabled()) {
      return res.json({
        name: null,
        sub: null,
        groups: [],
        // effectiveAccessLevel, not a local `isOpenWrite() ? ...` expression:
        // that would be a second implementation of the write policy, and the
        // whole point of reporting a level is that the interface and the API
        // cannot disagree about it.
        access_level: effectiveAccessLevel(req),
        ...posture,
      });
    }

    const user = req.oidc?.user;

    if (!user) {
      return res.status(401).json({ error: 'User not authenticated', login_url: '/login' });
    }

    // resolveRequestGroups, the same resolution authorize() uses: it prefers the
    // list resolved at sign-in (which may have come from the provider's userinfo
    // endpoint rather than the ID token) and falls back to the token's claims.
    // Reporting anything else here would show an empty group list to a user the
    // API is happily authorizing.
    const groups = resolveRequestGroups(req);

    res.json({
      name: user.name,
      sub: user.sub,
      email: user.email,
      groups,
      // Computed server-side from the same mapping authorize() uses, so the
      // interface and the API can never disagree about what this user may do.
      access_level: effectiveAccessLevel(req),
      ...posture,
    });
  } catch (err) {
    console.error('Error in /api/userinfo:', err);
    res.status(500).json({ error: 'Failed to retrieve user info' });
  }
});

module.exports=router;
