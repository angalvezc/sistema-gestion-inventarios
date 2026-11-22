// Rutas /api/v1/audit/** (Entrega 2, §2.1). Los permisos por rol ya los aplicó el API Gateway.
const express = require('express');
const { asyncHandler } = require('./errorHandler');
const { requestUser } = require('./requestUser');

function auditRoutes({ kardexService, returnService, dashboardService }) {
  const router = express.Router();

  // ---------- Kardex (RF07) ----------
  router.get('/kardex', asyncHandler(async (req, res) => {
    res.json(await kardexService.list(req.query));
  }));

  // Antes de /kardex/:id para que "verify" no se tome como un id.
  router.get('/kardex/verify', asyncHandler(async (req, res) => {
    res.json(await kardexService.verify());
  }));

  router.get('/kardex/:id', asyncHandler(async (req, res) => {
    res.json(await kardexService.get(req.params.id));
  }));

  // ---------- Devoluciones (RF11) ----------
  router.post('/returns', asyncHandler(async (req, res) => {
    res.status(201).json(await returnService.create(req.body, requestUser(req)));
  }));

  router.get('/returns', asyncHandler(async (req, res) => {
    res.json(await returnService.list(req.query));
  }));

  // ---------- Dashboard (RF12) ----------
  router.get('/dashboard/metrics', asyncHandler(async (req, res) => {
    res.json(await dashboardService.metrics());
  }));

  return router;
}

module.exports = { auditRoutes };
