// routes/foodRoutes.js

const express = require('express');
const router = express.Router();
const foodController = require('../controllers/foodController');
const multer = require('multer');
const storage = multer.memoryStorage(); // Store image in memory for processing
const upload = multer({ storage: storage });

// Image upload and calorie/macronutrient calculation (POST /api/food/analyze)
router.post('/analyze', upload.single('image'), foodController.analyzeImage);

// History retrieval (GET /api/food/history)
router.get('/history', foodController.getHistory);

// History download (GET /api/food/history/download)
router.get('/history/download', foodController.downloadHistory);

module.exports = router;