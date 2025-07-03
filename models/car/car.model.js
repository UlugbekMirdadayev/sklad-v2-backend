const mongoose = require("mongoose");
const { withBaseFields } = require("../base.model");

const carSchema = withBaseFields(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
);

module.exports = mongoose.model("Car", carSchema);
