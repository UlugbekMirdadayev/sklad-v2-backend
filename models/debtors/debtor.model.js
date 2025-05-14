const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const debtorSchema = withBaseFields({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: false, // Ba'zida umumiy qarz bo'lishi mumkin
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },
  totalDebt: {
    type: Number,
    required: true,
    default: 0,
  },
  paidAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  remainingDebt: {
    type: Number,
    required: true,
    default: function () {
      return this.totalDebt - this.paidAmount;
    },
  },
  description: {
    type: String,
    required: false,
    trim: true,
    default: "",
  },
  date_returned: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "partial", "paid"],
    default: "pending",
  },
});

module.exports = mongoose.model("Debtor", debtorSchema);
