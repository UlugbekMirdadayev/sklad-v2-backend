const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const batchSchema = withBaseFields({
  products: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
    },
  ],
  arrivedAt: {
    type: Date,
    required: true,
  },
  expiryDate: {
    type: Date,
  },
  transportCost: {
    type: Number,
    default: 0,
  },
  notes: {
    type: String,
    default: "",
  },
});

module.exports = mongoose.model("Batch", batchSchema);
