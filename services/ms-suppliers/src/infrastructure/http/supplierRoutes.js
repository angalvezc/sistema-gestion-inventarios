// Rutas /api/v1/suppliers/** (Entrega 2, §2.1).
// Los permisos por rol (ADMIN para escribir) ya los aplicó el API Gateway.
const express = require('express');
const { asyncHandler } = require('./errorHandler');

function supplierRoutes(suppliers) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await suppliers.list(req.query));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    res.status(201).json(await suppliers.create(req.body));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await suppliers.get(req.params.id));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    res.json(await suppliers.update(req.params.id, req.body));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await suppliers.deactivate(req.params.id);
    res.status(204).end();
  }));

  return router;
}

module.exports = { supplierRoutes };
