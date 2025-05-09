const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  meals: [
    {
      timestamp: {
        type: String,
        required: true,
      },
      foods: [String],
      calories: Number,
      macronutrients: {
        protein: Number,
        carbs: Number,
        fats: Number,
      },
    },
  ],
});

HistorySchema.index({ userId: 1, date: 1 }); // Index for efficient querying

module.exports = mongoose.model('History', HistorySchema);