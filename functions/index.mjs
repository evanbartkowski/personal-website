import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createCloudChatHandler } from './runtime/server/cloud-chat.mjs';
import { createVisitorHandler } from './runtime/server/visitors.mjs';
import { createVisitorStore } from './visitor-store.mjs';
import { createArcadeHandler } from './runtime/server/arcade-scores.mjs';
import { createArcadeScoreStore } from './arcade-score-store.mjs';

const apiKey = defineSecret('GEMINI_API_KEY');
// Access the secret only when a request reaches the deployed runtime. Source
// discovery and builds never need its value or a local environment file.
const handler = createCloudChatHandler({env: {
  get GEMINI_API_KEY() {return apiKey.value();},
  get GEMINI_MODEL() {return process.env.GEMINI_MODEL;},
}});

export const portfolioChat = onRequest({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 35,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 3,
  invoker: 'public',
  cors: false,
  secrets: [apiKey],
}, (request, response) => handler(request, response));

const visitorSalt = defineSecret('VISITOR_HASH_SALT');
const adminApp = getApps()[0] || initializeApp({projectId:'personal-website-7d04c'});
const visitorHandler = createVisitorHandler({
  store: createVisitorStore({db:getFirestore(adminApp,'portfolio-visitors')}),
  env: {get VISITOR_HASH_SALT() {return visitorSalt.value();}},
});
export const visitorAnalytics = onRequest({
  region:'us-central1', memory:'256MiB', timeoutSeconds:20,
  minInstances:0, maxInstances:1, concurrency:20, invoker:'public', cors:false,
  secrets:[visitorSalt],
}, async (request,response) => {
  if (!await visitorHandler(request,response)) response.status(404).json({error:'Visitor route not found.'});
});

const arcadeHandler = createArcadeHandler({
  store:createArcadeScoreStore({db:getFirestore(adminApp,'portfolio-visitors')}),
  env:{get VISITOR_HASH_SALT(){return visitorSalt.value();}},
});
export const arcadeScores = onRequest({
  region:'us-central1', memory:'256MiB', timeoutSeconds:20,
  minInstances:0, maxInstances:1, concurrency:4, invoker:'public', cors:false,
  secrets:[visitorSalt],
}, async (request,response) => {
  if (!await arcadeHandler(request,response)) response.status(404).json({error:'Arcade route not found.'});
});
