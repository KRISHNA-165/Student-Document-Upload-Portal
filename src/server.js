const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Student Document Upload and Verification Portal`);
  console.log(` Server is running on http://localhost:${PORT}`);
  console.log(` US01 - Student Document Upload Service Active`);
  console.log(`====================================================`);
});

