const mongoose = require("mongoose");

const BalanceSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Balance", BalanceSchema);
