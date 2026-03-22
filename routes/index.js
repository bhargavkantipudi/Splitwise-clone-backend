var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = router;
