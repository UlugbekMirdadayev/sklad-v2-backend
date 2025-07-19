const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

// Swagger sozlamalari
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Moy Almashtirish Servis API",
      version: "1.0.0",
      description: "Avto servis tizimi uchun Swagger dokumentatsiyasi",
    },
    servers: [
      {
        url: "http://localhost:8080",
        description: "Local server",
      },
      {
        url: "https://umaoil.up.railway.app",
        description: "Production server",
      },
    ],
  },
  apis: ["./routes/*.js"], // Swagger yozuvlar bo‘ladigan fayllar yo‘li
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = { swaggerUi, swaggerSpec };
