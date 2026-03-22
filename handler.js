const serverless = require('serverless-http');
const app = require('./app');

// Wrap the Express app for AWS Lambda
module.exports.handler = serverless(app);
