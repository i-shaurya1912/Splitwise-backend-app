const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  splitBetween: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      amount: { type: Number },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);