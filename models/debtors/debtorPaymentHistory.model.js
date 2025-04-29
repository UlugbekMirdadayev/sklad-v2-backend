const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const debtorPaymentHistorySchema = withBaseFields({
  debtor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Debtor",
    required: true,
  },
  amountPaid: {
    type: Number,
    required: true,
  },
  paidAt: {
    type: Date,
    default: Date.now,
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "card", "transfer"],
    default: "cash",
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
});

module.exports = mongoose.model(
  "DebtorPaymentHistory",
  debtorPaymentHistorySchema
);
