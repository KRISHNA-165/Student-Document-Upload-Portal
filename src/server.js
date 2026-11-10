const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` AcademiaFlow · Student Document Upload Portal`);
  console.log(` Server is running on http://localhost:${PORT}`);
  console.log(` All 10 User Stories Active & Ready (US01 - US10)`);
  console.log(`====================================================`);
});

