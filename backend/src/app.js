import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { auth, errorHandler, HttpError } from './middleware.js';
import authRoutes from './routes/auth.js';
import teamRoutes from './routes/teams.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';
import searchRoutes from './routes/search.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import chatRoutes from './routes/chat.js';
import { stream } from './events.js';
import { openapi } from './openapi.js';

// Express 5: errors thrown in async handlers and middleware reach the error handler automatically.
export const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.get('/api/openapi.json', (_req, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'TaskFlow API Docs' }));

app.get('/api/events', auth, stream); // Server-Sent Events: realtime project changes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', auth, dashboardRoutes);
app.use('/api/search', auth, searchRoutes);
app.use('/api/admin', auth, adminRoutes);
app.use('/api/notifications', auth, notificationRoutes);
app.use('/api/projects', auth, projectRoutes);
app.use('/api', auth, teamRoutes);
app.use('/api', auth, taskRoutes);
app.use('/api', auth, chatRoutes);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route not found')));
app.use(errorHandler);
