import express, { Request, Response } from 'express';
import { requiresAuth } from 'express-openid-connect';

const router = express.Router();

router.get('/', requiresAuth(), async (req: Request, res: Response) => {
  try {
    const user = req.oidc.user;

    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Send back basic info and groups
    res.json({
      name: user.name,
      sub: user.sub,
      groups: user.edumember_is_member_of,
    });
  } catch (err) {
    console.error('Error in /api/userinfo:', err);
    res.status(500).json({ error: 'Failed to retrieve user info' });
  }
});

module.exports=router;
