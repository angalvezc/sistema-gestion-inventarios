// Rutas /api/v1/purchases/orders/** (Entrega 2, §2.1).
// Los permisos por rol ya los aplicó el API Gateway.
const express = require('express');
const { asyncHandler } = require('./errorHandler');
const { requestUser } = require('./requestUser');

function orderRoutes(purchases) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await purchases.list(req.query));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    res.status(201).json(await purchases.create(req.body, requestUser(req)));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await purchases.get(req.params.id));
  }));

  router.post('/:id/approve', asyncHandler(async (req, res) => {
    res.json(await purchases.approve(req.params.id, requestUser(req)));
  }));

  router.post('/:id/receive', asyncHandler(async (req, res) => {
    res.json(await purchases.receive(req.params.id, requestUser(req)));
  }));

  router.post('/:id/cancel', asyncHandler(async (req, res) => {
    res.json(await purchases.cancel(req.params.id, requestUser(req)));
  }));

  return router;
}

module.exports = { orderRoutes };
