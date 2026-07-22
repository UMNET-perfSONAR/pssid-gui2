import express, { Request, Response } from 'express';
import { requiresAuth } from 'express-openid-connect';
import { isSsoEnabled } from '../shared/accessControl';

const router = express.Router();

// Resolved through isSsoEnabled(), NOT the compiled config.ENABLE_SSO: the
// posture can be switched by environment variable without a rebuild, which is
// the whole point of shipping prebuilt images (install.sh --pull). Reading the
// compiled default here instead would desynchronise this route from the rest of
// the app on a pulled image — the OIDC middleware would authenticate the user
// while this endpoint still reported "nobody is signed in", and the client would
// fall back to the OPEN_WRITE policy for a user who actually has a session.
//
// With SSO disabled there is no authenticated identity (write access is governed
// by OPEN_WRITE instead), so skip the OIDC guard. Applying requiresAuth() then
// would throw "req.oidc is not found", because the auth middleware is only
// mounted when SSO is on.
const guard = isSsoEnabled()
  ? requiresAuth()
  : (_req: Request, _res: Response, next: Function) => next();

router.get('/', guard, async (req: Request, res: Response) => {
  try {
    // No SSO: return an empty identity rather than erroring; the client treats
    // this as "no signed-in user" and falls back to the OPEN_WRITE policy.
    // Same env-aware resolution as the guard above, for the same reason.
    if (!isSsoEnabled()) {
      return res.json({ name: null, sub: null, groups: [] });
    }

    const user = req.oidc.user;

    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Support both the eduPerson edumember claim and the standard groups claim.
    res.json({
      name: user.name,
      sub: user.sub,
      groups: user.edumember_is_member_of || user.groups || [],
    });
  } catch (err) {
    console.error('Error in /api/userinfo:', err);
    res.status(500).json({ error: 'Failed to retrieve user info' });
  }
});

module.exports=router;
