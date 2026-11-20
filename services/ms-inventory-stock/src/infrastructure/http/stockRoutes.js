// Rutas /api/v1/stock/** y /api/v1/warehouses (Entrega 2, §2.1).
// Los permisos por rol ya los aplicó el API Gateway.
const express = require('express');
const { asyncHandler } = require('./errorHandler');
const { requestUser } = require('./requestUser');

function stockRoutes(stockService) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await stockService.listStock(req.query));
  }));

  // Las rutas fijas van antes que /:productId para que "alerts" no se tome como un id.
  router.get('/alerts', asyncHandler(async (req, res) => {
    res.json(await stockService.listAlerts(req.query));
  }));

  router.post('/movements', asyncHandler(async (req, res) => {
    res.status(201).json(await stockService.registerMovement(req.body, requestUser(req)));
  }));

  router.post('/transfers', asyncHandler(async (req, res) => {
    res.status(201).json(await stockService.transfer(req.body, requestUser(req)));
  }));

  router.get('/:productId', asyncHandler(async (req, res) => {
    res.json(await stockService.getProductStock(req.params.productId));
  }));

  router.put('/:productId/min-threshold', asyncHandler(async (req, res) => {
    res.json(await stockService.setMinThreshold(req.params.productId, req.body));
  }));

  return router;
}

function warehouseRoutes(stockService) {
  const router = express.Router();
  router.get('/', asyncHandler(async (req, res) => {
    res.json(await stockService.listWarehouses());
  }));
  return router;
}

module.exports = { stockRoutes, warehouseRoutes };
