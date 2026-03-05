import express from 'express';

// Server initialization functions
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware functions
app.use(express.json());
app.use(express.static('public'));
app.use('/modules', express.static('modules'));

// Server execution functions
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});