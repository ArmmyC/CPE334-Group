import './config.js';
import { createApp } from './app.js';
import { checkDatabase } from './db.js';

const port = Number(process.env.PORT ?? 4100);

createApp({ checkDatabase }).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
