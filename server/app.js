import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ensureDb } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import flightRoutes from './routes/flightRoutes.js';
import hotelRoutes from './routes/hotelRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import cronRoutes from './routes/cronRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import meRoutes from './routes/meRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
import sandboxRoutes from './routes/sandboxRoutes.js';
import { requestContext } from './utils/context.js';
import { servePhoto } from './controllers/photoController.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { HttpError } from './utils/httpError.js';

// The SPA and the API are served from the same origin (Vite proxy locally, one Vercel
// project in production), so no CORS middleware is needed — cross-origin calls are refused
// by the browser by default.
export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Vercel (and the Vite dev proxy) sit in front; use X-Forwarded-For for the client IP
  app.use(helmet());
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Misconfiguration should fail loudly with our JSON error shape, not crash the function.
  app.use('/api', (req, res, next) => {
    if (!process.env.JWT_SECRET) throw new HttpError(500, 'Server is missing JWT_SECRET', 'MISCONFIGURED');
    next();
  });
  app.use('/api', ensureDb); // reuses the cached Mongoose connection
  app.use('/api', requestContext); // real-data scope for every query in the request (see models/plugins/sandboxScope.js)

  app.get('/api/photos/:id', servePhoto); // uploaded hotel photos (public, cached)
  app.use('/api/auth', authRoutes);
  app.use('/api/flights', flightRoutes);
  app.use('/api/hotels', hotelRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/offers', offerRoutes);
  app.use('/api/supplier', supplierRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/cron', cronRoutes);
  app.use('/api/sandbox', sandboxRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
