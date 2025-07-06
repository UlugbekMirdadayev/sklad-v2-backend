const mongoose = require("mongoose");
const { withBaseFields } = require("../base.model");

const avtomobilSchema = withBaseFields(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
);

module.exports = mongoose.model("Avtomobil", avtomobilSchema);
