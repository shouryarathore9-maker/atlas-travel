// Local development server only. On Vercel, /api/index.js exports the same Express app
// as a function instead — there is no long-running process there.
import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';

const port = Number(process.env.PORT) || 5000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

await connectDb(process.env.MONGODB_URI);
createApp().listen(port, () => {
  console.log(`Atlas API listening on http://localhost:${port}`);
});
