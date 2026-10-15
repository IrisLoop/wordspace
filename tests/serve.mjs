import { makeServer } from '../server.mjs';
import path from 'node:path';
makeServer({ dataDir:path.resolve('test-results/browser-data') }).listen(43128, '127.0.0.1',()=>console.log('QA ready http://127.0.0.1:43128'));
