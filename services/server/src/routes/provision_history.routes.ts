import { Router, Request, Response } from 'express';
import { connectToMongoDB } from '../services/database.service';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db('gui');
    const history = await db.collection('provision_history')
      .find()
      .sort({ timestamp: -1 })
      .limit(100)
      .project({ _id: 0 })
      .toArray();
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch provision history' });
  }
});

module.exports = router;
