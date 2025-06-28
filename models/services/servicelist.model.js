const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const serviceListSchema = withBaseFields({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
});

module.exports = mongoose.model("ServiceList", serviceListSchema);
