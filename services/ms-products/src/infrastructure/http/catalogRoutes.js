// Rutas /api/v1/products/** y /api/v1/categories (Entrega 2, §2.1).
// Los permisos por rol (ADMIN para escribir) ya los aplicó el API Gateway.
const express = require('express');
const { asyncHandler } = require('./errorHandler');

function productRoutes(catalog) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await catalog.listProducts(req.query));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    res.status(201).json(await catalog.createProduct(req.body));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await catalog.getProduct(req.params.id));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    res.json(await catalog.updateProduct(req.params.id, req.body));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await catalog.deactivateProduct(req.params.id);
    res.status(204).end();
  }));

  return router;
}

function categoryRoutes(catalog) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await catalog.listCategories());
  }));

  router.post('/', asyncHandler(async (req, res) => {
    res.status(201).json(await catalog.createCategory(req.body));
  }));

  return router;
}

module.exports = { productRoutes, categoryRoutes };
