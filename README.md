# Personal Expense Tracker

Node.js, Express, EJS, and MongoDB/Mongoose application.

## Local setup

1. Install Node.js.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `MONGO_URI` to your MongoDB connection string and `SESSION_SECRET` to a long random secret.
5. Run `npm run dev` for development or `npm start` to run normally.
6. Open `http://localhost:3000` unless your `PORT` environment variable specifies another port.

Do not commit `.env` or publish database credentials. This package intentionally excludes `.env` and `node_modules`; npm will install dependencies from `package.json` and `package-lock.json`.
