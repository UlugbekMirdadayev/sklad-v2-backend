const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["cash-in", "cash-out"],
      required: true,
    },
    amount: { type: Number, required: true },
    paymentType: {
      type: String,
      enum: ["cash", "card", "credit"],
      required: true,
    },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Transaction", TransactionSchema);
