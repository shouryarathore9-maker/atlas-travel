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
