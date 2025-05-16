const mongoose = require("mongoose");
const { withBaseFields } = require("../base.model");

const transactionSchema = withBaseFields({
  type: {
    type: String,
    enum: ["cash-in", "cash-out"],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
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
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
  },
});

module.exports = mongoose.model("Transaction", transactionSchema);
