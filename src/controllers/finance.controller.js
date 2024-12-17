import fetch from 'node-fetch';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const getStockData = asyncHandler(async (req, res, next) => {
    const { symbol } = req.params;
  
    // Construct Yahoo Finance API URL for historical data (last 30 days)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=30d&interval=1d`;
  
    try {
      const response = await fetch(url);
  
      if (!response.ok) {
        console.error(`Yahoo API Error: ${response.statusText}`);
        return next(new ApiError(500, 'Error fetching data from Yahoo Finance'));
      }
  
      const data = await response.json();
  
      // Log the entire data response to check its structure
      console.log('Yahoo API Response:', JSON.stringify(data, null, 2));
  
      if (!data?.chart?.result || data.chart.result.length === 0) {
        console.error('No valid stock data received:', data);
        return next(new ApiError(404, 'Stock data not found or invalid symbol'));
      }
  
      // Extract the stock data from the response
      const stockData = data.chart.result[0];
  
      // Log important parts of the response for debugging
      console.log('Stock Data:', stockData);
  
      const timestamps = stockData.timestamp || [];
      const adjClosePrices = stockData.indicators?.adjclose[0]?.adjclose || []; // Corrected this line
  
      console.log('Timestamps:', timestamps);
      console.log('Adjusted Close Prices:', adjClosePrices);
  
      // Check if timestamps or adjusted close prices are missing
      if (!timestamps.length || !adjClosePrices.length) {
        console.error('Timestamps or Adjusted Close prices are missing');
        return next(new ApiError(404, 'Insufficient data for stock chart'));
      }
  
      // Ensure we're only using the last 30 days of data
      const dataLimit = Math.min(timestamps.length, 30);
      const slicedAdjClosePrices = adjClosePrices.slice(-dataLimit);
  
      // Prepare the result with the required fields
      const result = {
        currentPrice: stockData.meta?.regularMarketPrice || null,
        percentageChange: stockData.meta?.regularMarketChangePercent || "NA",
        todayChange: stockData.meta?.regularMarketChange || "NA",
        stockPrices: slicedAdjClosePrices, // Historical adjusted close prices for the last 30 days
      };
  
      // Send the response data
      const responseData = new ApiResponse(200, 'Stock data fetched successfully', result);
      return res.status(responseData.status).json(responseData);
  
    } catch (error) {
      console.error('Error fetching data from Yahoo Finance:', error.message);
      return next(new ApiError(500, 'Internal Server Error'));
    }
  });
  

export default { getStockData };
