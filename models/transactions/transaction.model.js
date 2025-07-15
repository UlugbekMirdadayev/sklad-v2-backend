const mongoose = require("mongoose");
const { withBaseFields } = require("../base.model");

const transactionSchema = withBaseFields({
  type: {
    type: String,
    enum: ["cash-in", "cash-out"],
    required: true,
  },
  amount: {
    usd: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    uzs: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  paymentType: {
    type: String,
    enum: ["cash", "card"],
    required: true,
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
});

module.exports = mongoose.model("Transaction", transactionSchema);
