// routes/financeRoutes.js
import express from 'express';
import financeController from '../controllers/finance.controller.js';

const router = express.Router();

// Define route to fetch stock data by symbol
router.get('/stock/:symbol', financeController.getStockData);

export default router;
