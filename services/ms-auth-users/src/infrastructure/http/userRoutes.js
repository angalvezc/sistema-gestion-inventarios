// Rutas /api/v1/users/** — rol ADMIN, verificado por el API Gateway (Entrega 2, §2.1)
const express = require('express');
const { asyncHandler } = require('./errorHandler');

function userRoutes(userService) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await userService.list(req.query));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    res.status(201).json(await userService.create(req.body));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    res.json(await userService.update(req.params.id, req.body));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await userService.deactivate(req.params.id);
    res.status(204).end();
  }));

  return router;
}

module.exports = { userRoutes };
