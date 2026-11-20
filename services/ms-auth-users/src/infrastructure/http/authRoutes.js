// Rutas /api/v1/auth/** (Entrega 2, §2.1)
const express = require('express');
const { asyncHandler } = require('./errorHandler');

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function authRoutes(authService) {
  const router = express.Router();

  // Público: autentica y devuelve el JWT.
  router.post('/login', asyncHandler(async (req, res) => {
    res.json(await authService.login(req.body));
  }));

  // Renueva el access token usando el refresh token.
  router.post('/refresh', asyncHandler(async (req, res) => {
    res.json(await authService.refresh(req.body));
  }));

  // Interno: devuelve los claims si el token es válido.
  router.get('/validate', (req, res) => {
    res.json(authService.validate(bearerToken(req)));
  });

  return router;
}

module.exports = { authRoutes };
